
// this file serves the same purpose as handleUri but starting from the VSCode side
// of things so it does less things
//Q: Do we need to worry if they are logged in because i feel like they
//would already be if they have access to the button (?)

import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
//import { ProjectLanguage, projectLanguageSetting } from '../constants';
import { ext } from '../extensionVariables';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';
//import { nonNullProp } from '../utils/nonNull';
//import { getGlobalSetting } from '../vsCodeConfig/settings';
import { setupProjectFolderParsed } from './setupProjectFolder';




export async function requestDownload(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn();
    if (!isLoggedIn) {
        await vscode.commands.executeCommand('azure-account.login');
    }
    const filePathUri: vscode.Uri[] = await ext.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });


    //const language: ProjectLanguage = nonNullProp(context, 'language');
    //const language: ProjectLanguage | undefined = <ProjectLanguage>options.language || getGlobalSetting(projectLanguageSetting);
    //const language: ProjectLanguage | undefined = getGlobalSetting(projectLanguageSetting);


    // hard coding for valentina-portal-functionapp because I want to test but idk how to get resource group and language
    const language: string = "node";
    const resourceId: string = "/subscriptions/5545ed18-550e-4881-adf7-be4383cbe274/resourceGroups/chloe-portalfunctionapp/providers/Microsoft.Web/sites/chloe-portalfunctionapp";
    await setupProjectFolderParsed(resourceId, language, filePathUri[0], context, node);

}
/*
export async function requestDownload(context: IActionContext, node: AzureTreeItem): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.handleUri', async (context: IActionContext) => {
        const enableOpenFromPortal: boolean | undefined = getWorkspaceSetting<boolean>('enableOpenFromPortal');
        if (enableOpenFromPortal) { // Valen: enableOpenFromPortal is a boolean from getWorkspaceSetting
            const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn();
            if (!isLoggedIn) {
                await vscode.commands.executeCommand('azure-account.login');
            }
            const filePathUri: vscode.Uri[] = await ext.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });

            const language: string = "node";
            const resourceId: string = "subscriptions/5545ed18-550e-4881-adf7-be4383cbe274/resourcegroups/valentina-portal-functionapp/providers/Microsoft.Web/sites/valentina-portal-functionapp";

            await setupProjectFolderParsed(resourceId, language, filePathUri[0], context);

        } else {
            throw new Error(localize('featureNotSupported', 'Download content and setup project feature is not supported for this extension version.'));
        }
    });
}
*/
