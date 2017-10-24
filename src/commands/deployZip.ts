/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as vscode from 'vscode';
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { IUserInterface } from '../IUserInterface';
import { localize } from '../localize';
import { FunctionAppNode } from '../nodes/FunctionAppNode';
import * as workspaceUtil from '../utils/workspace';
import { VSCodeUI } from '../VSCodeUI';

export async function deployZip(explorer: AzureFunctionsExplorer, outputChannel: vscode.OutputChannel, uri?: vscode.Uri, node?: FunctionAppNode, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    const folderPath: string = uri ? uri.fsPath : await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectZipDeployFolder', 'Select the folder to zip and deploy'));

    if (!node) {
        node = <FunctionAppNode>(await explorer.showNodePicker(FunctionAppNode.contextValue));
    }

    const client: WebSiteManagementClient = node.getWebSiteClient();

    await node.siteWrapper.deployZip(folderPath, client, outputChannel);
}
