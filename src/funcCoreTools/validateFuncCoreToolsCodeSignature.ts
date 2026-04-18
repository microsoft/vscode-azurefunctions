/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { composeArgs, withArg } from "@microsoft/vscode-processutils";
import { type MessageItem } from "vscode";
import { ext } from "../extensionVariables";
import { localize } from "../localize";
import { cpUtils } from "../utils/cpUtils";
import { uninstallFuncCoreTools } from "./uninstallFuncCoreTools";

export async function validateFuncCoreToolsCodeSignature(context: IActionContext): Promise<boolean> {
    const funcCoreToolsPath: string | undefined = await getFuncCoreToolsPath();
    if (process.platform === 'darwin' || process.platform === 'win32') {
        if (!funcCoreToolsPath) {
            return false;
        }

        const isValid = await validateCodeSignature(funcCoreToolsPath);
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

const microsoftSubject = 'Microsoft Corporation';

async function validateDarwinCodeSignature(cliPath: string): Promise<boolean> {
    const codeSignResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'codesign', composeArgs(withArg('-v', cliPath))());
    if (codeSignResult.code !== 0) {
        return false;
    }

    // Check that the signing authority is Microsoft
    const signingResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'codesign', composeArgs(withArg('-dvv', cliPath))());
    // codesign -dvv writes to stderr
    return signingResult.cmdOutputIncludingStderr.includes(`Authority=Developer ID Application: ${microsoftSubject}`);
}

async function validateWin32CodeSignature(cliPath: string): Promise<boolean> {
    const psCommand = `$sig = Get-AuthenticodeSignature '${cliPath}'; if ($sig.Status -ne 'Valid') { exit 1 }; $sig.SignerCertificate.Subject`;
    const signingResult = await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'powershell', composeArgs(withArg('-Command', psCommand))());
    return signingResult.code === 0 && signingResult.cmdOutput.includes(`O=${microsoftSubject}`);
}
