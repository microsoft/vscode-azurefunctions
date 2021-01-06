import * as vscode from 'vscode';
import { AzureAccount } from '../debug/AzureAccountExtension.api';
import { GlobalStates } from '../extension';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { setupProjectFolder } from './setupProjectFolder';

export async function downloadAzureProjectFromUri(uri: vscode.Uri, azureAccountExt: vscode.Extension<AzureAccount> | undefined): Promise<void> {
    ext.context.globalState.update(GlobalStates.initProjectWithoutConfigVerification, true);
    const account: AzureAccount | undefined = await activateAzureExtension(azureAccountExt);
    if (account) {
        // tslint:disable-next-line:typedef
        const token = await setupAzureAccount(account);
        if (token) {
            const filePath: string | undefined = await vscode.window.showInputBox({ prompt: localize('absoluteFolderPathInputPromptText', 'Enter absolute folder path for your local project'), ignoreFocusOut: true });
            if (filePath) {
                // tslint:disable-next-line: no-unsafe-any
                return setupProjectFolder(uri, filePath, token.accessToken, account);
            } else {
                vscode.window.showErrorMessage(localize('filepathUndefinedErrorMessage', 'Folder path not entered. Please try again.'));
            }
        }
    }
}

async function setupAzureAccount(account: AzureAccount): Promise<any> {
    try {
        await vscode.commands.executeCommand('azure-account.login');
        return await account.sessions[0].credentials2.getToken();
    } catch (err) {
        vscode.window.showErrorMessage(localize('failedAzureAccSetupErrorMessage', 'Failed to setup Azure account. Please try again.'));
        return Promise.resolve(undefined);
    }
}

async function activateAzureExtension(azureAccountExt: vscode.Extension<AzureAccount> | undefined): Promise<AzureAccount | undefined> {
    return await azureAccountExt?.activate();
}
