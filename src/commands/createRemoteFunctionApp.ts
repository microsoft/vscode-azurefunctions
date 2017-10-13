/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureAccountWrapper } from "vscode-azureappservice";
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import * as FunctionsCli from '../functions-cli';
import { SubscriptionNode } from '../nodes/SubscriptionNode';
import { FunctionAppCreator } from "../FunctionAppCreator";
import * as TemplateFiles from '../template-files';

export async function createRemoteFunctionApp(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, azureAccount: AzureAccountWrapper, explorer: AzureFunctionsExplorer, node?: SubscriptionNode): Promise<void> {
    if (!node) {
        node = <SubscriptionNode>(await explorer.showNodePicker(SubscriptionNode.contextValue));
    }

    const client: WebSiteManagementClient = node.getWebSiteClient();
    var subscription = azureAccount.getFilteredSubscriptions().find(value => value.subscriptionId === client.subscriptionId);
    const wizard = new FunctionAppCreator(outputChannel, azureAccount, subscription, context.globalState);
    const result = await wizard.run();

    if (result.status === 'Completed') {
        vscode.commands.executeCommand('appService.Refresh', node);
    }
}
