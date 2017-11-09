/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Subscription } from 'azure-arm-resource/lib/subscription/models';
import { Site } from 'azure-arm-website/lib/models';
import { ServiceClientCredentials } from 'ms-rest';
import * as vscode from 'vscode';
import * as appServiceTools from 'vscode-azureappservice';
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { UserCancelledError } from '../errors';
import { SubscriptionNode } from '../nodes/SubscriptionNode';

export async function createFunctionApp(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, explorer: AzureFunctionsExplorer, node?: SubscriptionNode): Promise<void> {
    let subscription: Subscription | undefined;
    let credentials: ServiceClientCredentials | undefined;
    if (node) {
        subscription = node.subscriptionFilter.subscription;
        credentials = node.subscriptionFilter.session.credentials;
    }

    const site: Site | undefined = await appServiceTools.createFunctionApp(outputChannel, context.globalState, credentials, subscription);
    if (site) {
        if (node) {
            explorer.refresh(node);
        }
    } else {
        throw new UserCancelledError();
    }
}
