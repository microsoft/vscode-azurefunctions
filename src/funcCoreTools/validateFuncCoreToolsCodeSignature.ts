/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { composeArgs, withArg } from "@microsoft/vscode-processutils";
import { type MessageItem } from "vscode";
import { FuncVersion, getMajorVersion } from "../FuncVersion";
import { ext } from "../extensionVariables";
import { localize } from "../localize";
import { cpUtils } from "../utils/cpUtils";
import { uninstallFuncCoreTools } from "./uninstallFuncCoreTools";

// Code signature validation is only enforced for v4+ binaries. Older versions were
// published without code signatures, so we skip validation for those to avoid false warnings.
const minimumSignedVersion = FuncVersion.v4;

export async function validateFuncCoreToolsCodeSignature(context: IActionContext, version: FuncVersion): Promise<boolean> {
    if (Number(getMajorVersion(version)) < Number(getMajorVersion(minimumSignedVersion))) {
        // These versions have no code signature to verify
        return true;
    }

    const funcCoreToolsPath: string | undefined = await getFuncCoreToolsPath();
    if (!funcCoreToolsPath) {
        return false;
    }

    if (process.platform === 'darwin' || process.platform === 'win32') {
        ext.outputChannel.appendLog(localize('validatingCodeSignature', 'Validating code signature for Azure Functions Core Tools at "{0}"...', funcCoreToolsPath));
        const isValid = await validateCodeSignature(funcCoreToolsPath);
        ext.outputChannel.appendLog(isValid ?
            localize('codeSignatureValid', 'Successfully validated code signature for Azure Functions Core Tools.') :
            localize('codeSignatureInvalid', 'Failed to validate code signature for Azure Functions Core Tools.'));
        if (!isValid) {
            return await warnAndAskProceed(context);
        }
    }

    return true;
}

async function warnAndAskProceed(context: IActionContext): Promise<boolean> {
    const message = localize(
        'codeSignatureFailed',
        'Azure Functions Core Tools failed code signature verification. It may have been tampered with or installed from an untrusted source.'
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

export async function getFuncCoreToolsPath(workspacePath?: string): Promise<string | undefined> {
    switch (process.platform) {
        case 'darwin':
        case 'linux':
            return await cpUtils.executeCommand(ext.outputChannel, workspacePath, 'which', composeArgs(withArg('func'))());
        case 'win32':
            return await cpUtils.executeCommand(ext.outputChannel, workspacePath, 'where.exe', composeArgs(withArg('func'))());
        default:
            return undefined;
    }
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

export function isValidDarwinSignature(codesignResult: { code: number }, dvvResult: { cmdOutputIncludingStderr: string }): boolean {
    if (codesignResult.code !== 0) {
        return false;
    }
    return dvvResult.cmdOutputIncludingStderr.includes(`Authority=Developer ID Application: ${microsoftSubject}`);
}

export function isValidWin32Signature(psResult: { code: number; cmdOutput: string }): boolean {
    return psResult.code === 0 && psResult.cmdOutput.includes(`O=${microsoftSubject}`);
}

async function validateDarwinCodeSignature(cliPath: string): Promise<boolean> {
    // Verify the signature is valid (i.e. the binary has not been tampered with)
    const codeSignResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'codesign', composeArgs(withArg('-v', cliPath))());
    if (codeSignResult.code !== 0) {
        return false;
    }

    // Dump the signing details to verify the signing was done by Microsoft Corporation
    const signingResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'codesign', composeArgs(withArg('-dvv', cliPath))());
    // codesign -dvv writes to stderr
    const isValid = isValidDarwinSignature(codeSignResult, signingResult);
    if (isValid) {
        ext.outputChannel.appendLog(localize('verifiedAuthority', 'Verified signing authority "{0}".', microsoftSubject));
    }
    return isValid;
}

async function validateWin32CodeSignature(cliPath: string): Promise<boolean> {
    const psCommand = `$sig = Get-AuthenticodeSignature '${cliPath}'; if ($sig.Status -ne 'Valid') { exit 1 }; $sig.SignerCertificate.Subject`;
    const signingResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'powershell', composeArgs(withArg('-Command', psCommand))());
    return isValidWin32Signature(signingResult);
}
