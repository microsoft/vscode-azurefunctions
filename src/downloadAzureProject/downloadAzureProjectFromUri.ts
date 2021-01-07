import * as vscode from 'vscode';
import { GlobalStates } from '../extension';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { setupProjectFolder } from './setupProjectFolder';

export async function downloadAzureProjectFromUri(uri: vscode.Uri): Promise<void> {
    ext.context.globalState.update(GlobalStates.initProjectWithoutConfigVerification, true);
    const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn();
    if (!isLoggedIn) {
        await vscode.commands.executeCommand('azure-account.login');
    }

    const filePath: string | undefined = await vscode.window.showInputBox({ prompt: localize('absoluteFolderPathInputPromptText', 'Enter absolute folder path for your local project'), ignoreFocusOut: true });
    if (filePath) {
        // tslint:disable-next-line: no-unsafe-any
        return setupProjectFolder(uri, filePath);
    } else {
        vscode.window.showErrorMessage(localize('filepathUndefinedErrorMessage', 'Folder path not entered. Please try again.'));
    }
}
