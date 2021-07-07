
// this file serves the same purpose as handleUri but starting from the VSCode side
// of things so it does less things
//Q: Do we need to worry if they are logged in because i feel like they
//would already be if they have access to the button (?)

import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
//import { ProjectLanguage, projectLanguageSetting } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';
//import { nonNullProp } from '../utils/nonNull';
//import { getGlobalSetting } from '../vsCodeConfig/settings';
import { setupProjectFolderParsed } from './setupProjectFolder';

export async function requestDownload(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    const isLoggedIn: boolean = await ext.azureAccountTreeItem.getIsLoggedIn();
    if (!isLoggedIn) {
        await vscode.commands.executeCommand('azure-account.login');
    }
    if (node) {
        const filePathUri: vscode.Uri[] = await ext.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });

        //const language: ProjectLanguage = nonNullProp(context, 'language');
        //const language: ProjectLanguage | undefined = <ProjectLanguage>options.language || getGlobalSetting(projectLanguageSetting);
        //const language: ProjectLanguage | undefined = getGlobalSetting(projectLanguageSetting);


        // hard coding for valentina-portal-functionapp because I want to test but idk how to get language
        const language: string = "python";
        //throw new Error(localize('testKind', lang));
        const resourceId: string = node.id; // gets the subscription id
        await setupProjectFolderParsed(resourceId, language, filePathUri[0], context, node);
    } else {
        throw new Error(localize('noNode', 'Node is undefined'));
    }
}
