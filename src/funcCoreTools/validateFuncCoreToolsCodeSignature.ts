/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { composeArgs, withArg } from "@microsoft/vscode-processutils";
import * as fse from "fs-extra";
import * as path from "path";
import { type MessageItem } from "vscode";
import { npmFuncPackageName } from "../constants";
import { ext } from "../extensionVariables";
import { FuncVersion, getMajorVersion } from "../FuncVersion";
import { localize } from "../localize";
import { cpUtils } from "../utils/cpUtils";
import { uninstallFuncCoreTools } from "./uninstallFuncCoreTools";

export async function validateFuncCoreToolsCodeSignature(context: IActionContext, version: FuncVersion): Promise<boolean> {
    if (!isCodeSignatureExpected(version)) {
        // Nothing to verify for this version/platform combination
        return true;
    }

    const funcCoreToolsPath: string | undefined = await getFuncCoreToolsPath();
    if (!funcCoreToolsPath) {
        return false;
    }

    const isValid = await validateCodeSignature(funcCoreToolsPath);
    ext.outputChannel.appendLog(localize('validatingCodeSignature', 'Validating code signature for Azure Functions Core Tools at "{0}"...', funcCoreToolsPath));
    ext.outputChannel.appendLog(isValid ?
        localize('codeSignatureValid', 'Successfully validated code signature for Azure Functions Core Tools.') :
        localize('codeSignatureInvalid', 'Failed to validate code signature for Azure Functions Core Tools.'));

    if (!isValid) {
        return await warnAndAskProceed(context, funcCoreToolsPath);
    }

    return true;
}

/**
 * Code signing differs by platform:
 * - Windows: func binaries signed across all versions (v1-v4).
 * - macOS: binaries were only codesigned/notarized (Apple Developer ID) starting with v4; earlier
 *   cross-platform builds (v2, v3) seem to be shipped unsigned. (v1 was Windows-only)
 * - Other platforms (primarily Linux) we skip due to no well established form of signature validation.
 */
export function isCodeSignatureExpected(version: FuncVersion, platform: NodeJS.Platform = process.platform): boolean {
    switch (platform) {
        case 'win32':
            return true;
        case 'darwin':
            return Number(getMajorVersion(version)) >= Number(getMajorVersion(FuncVersion.v4));
        default:
            return false;
    }
}

async function getFuncCoreToolsPath(workspacePath?: string): Promise<string | undefined> {
    let funcLookupOutput: string | undefined;
    switch (process.platform) {
        case 'darwin':
        case 'linux':
            funcLookupOutput = await cpUtils.executeCommand(ext.outputChannel, workspacePath, 'which', composeArgs(withArg('func'))());
            break;
        case 'win32':
            funcLookupOutput = await cpUtils.executeCommand(ext.outputChannel, workspacePath, 'where.exe', composeArgs(withArg('func'))());
            break;
        default:
            return undefined;
    }

    return parseFuncCoreToolsPath(funcLookupOutput, process.platform);
}

/**
 * Resolves the func CLI path from the raw output of the path-lookup command (`which` / `where.exe`).
 */
export function parseFuncCoreToolsPath(funcLookupOutput: string | undefined, platform: NodeJS.Platform): string | undefined {
    // Multiple lines can return. Split and trim so the resolved path never contains an embedded newline.
    const matches = (funcLookupOutput ?? '').split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (matches.length === 0) {
        return undefined;
    }

    let funcPath: string = matches[0];
    if (platform === 'win32') {
        // If the first match is already the real executable, use it directly.
        if (funcPath.toLowerCase().endsWith('func.exe')) {
            return funcPath;
        }

        // Otherwise it could be an auto-generated launcher shim (func, func.cmd, func.ps1) from a global npm
        // install of azure-functions-core-tools. The shim itself isn't the signed binary, so try to
        // resolve the real func.exe from the npm global install pattern.
        funcPath = tryResolveWindowsFuncExeFromNpmGlobalInstall(funcPath) ?? funcPath;
    }

    return funcPath;
}

function tryResolveWindowsFuncExeFromNpmGlobalInstall(funcLaunchPath: string): string | undefined {
    // No version segment is needed in this path because npm's global node_modules is flat and unversioned.
    // Each package lives in a single folder named after it (only one version is globally installed at a time).
    const resolvedExe = path.join(path.dirname(funcLaunchPath), 'node_modules', npmFuncPackageName, 'bin', 'func.exe');
    return fse.pathExistsSync(resolvedExe) ? resolvedExe : undefined;
}

async function warnAndAskProceed(context: IActionContext, funcCoreToolsPath: string): Promise<boolean> {
    const message = localize(
        'codeSignatureFailed',
        'Azure Functions Core Tools failed code signature verification.\n\n"{0}" was inspected, see the output log for details.',
        funcCoreToolsPath
    );
    const continueAnyway: MessageItem = { title: localize('continueAnyway', 'Continue Anyway') };
    const uninstall: MessageItem = { title: localize('uninstall', 'Uninstall (Recommended)') };

    const result = await context.ui.showWarningMessage(message, { modal: true }, continueAnyway, uninstall);

    if (result === uninstall) {
        await uninstallFuncCoreTools(context);
        return false;
    }

    return true;
}

export async function validateCodeSignature(cliPath: string): Promise<boolean> {
    switch (process.platform) {
        case 'darwin':
            return validateDarwinCodeSignature(cliPath);
        case 'win32':
            return validateWin32CodeSignature(cliPath);
        default:
            throw new Error();
    }
}

export const microsoftSubject = 'Microsoft Corporation';

async function validateDarwinCodeSignature(cliPath: string): Promise<boolean> {
    // Verify the signature is valid (i.e. the binary has not been tampered with)
    const codeSignResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'codesign', composeArgs(withArg('-v', cliPath))());
    if (codeSignResult.code !== 0) {
        return false;
    }

    // Inspect the signing details to verify the signing was done by Microsoft Corporation
    const signingResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'codesign', composeArgs(withArg('-dvv', cliPath))());
    const isValid = isValidDarwinSignature(codeSignResult, signingResult);

    ext.outputChannel.appendLog(isValid ?
        localize('successVerifyAuthority', 'Successfully verified signing authority "{0}".', microsoftSubject) :
        localize('failedVerifyAuthority', 'Failed to verify signing authority "{0}".', microsoftSubject));

    return isValid;
}

export function isValidDarwinSignature(codesignResult: { code: number }, dvvResult: { cmdOutputIncludingStderr: string }): boolean {
    if (codesignResult.code !== 0) {
        return false;
    }
    // -dvv writes to stderr
    return dvvResult.cmdOutputIncludingStderr.includes(`Authority=Developer ID Application: ${microsoftSubject}`);
}

async function validateWin32CodeSignature(cliPath: string): Promise<boolean> {
    const psCommand = `$sig = Get-AuthenticodeSignature '${cliPath}'; if ($sig.Status -ne 'Valid') { exit 1 }; $sig.SignerCertificate.Subject`;
    const signingResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'powershell', composeArgs(withArg('-Command', psCommand))());
    return isValidWin32Signature(signingResult);
}

export function isValidWin32Signature(psResult: { code: number; cmdOutput: string }): boolean {
    return psResult.code === 0 && psResult.cmdOutput.includes(`O=${microsoftSubject}`);
}
