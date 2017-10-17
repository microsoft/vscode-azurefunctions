/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as vscode from 'vscode';
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { FunctionAppNode } from '../nodes/FunctionAppNode';
import * as util from '../util';
import { localize } from '../util';

export async function deployZip(explorer: AzureFunctionsExplorer, outputChannel: vscode.OutputChannel, node?: FunctionAppNode): Promise<void> {
    if (!node) {
        node = <FunctionAppNode>(await explorer.showNodePicker(FunctionAppNode.contextValue));
    }

    const client: WebSiteManagementClient = node.getWebSiteClient();

    const newFolderId: string = 'newFolder';
    let folderPicks: util.PickWithData<string>[] = [new util.PickWithData(newFolderId, localize('azFunc.selectOtherFolder', '$(plus) Select other folder'))];
    const folders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
    if (folders) {
        folderPicks = folderPicks.concat(folders.map((f: vscode.WorkspaceFolder) => new util.PickWithData<string>('', f.uri.fsPath)));
    }
    const folder: util.PickWithData<string> = await util.showQuickPick<string>(folderPicks, localize('azFunc.deployZipSelectFolder', 'Select a workspace folder to deploy to your Function App'));
    const folderPath: string = folder.data === newFolderId ? await util.showFolderDialog() : folder.label;

    await node.siteWrapper.deployZip(folderPath, client, outputChannel);
}
