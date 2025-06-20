/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type FunctionEnvelope } from "@azure/arm-appservice";
import { DialogResponses, type IActionContext, type IAzureMessageOptions } from "@microsoft/vscode-azext-utils";
import * as retry from 'p-retry';
import { type WorkspaceFolder } from "vscode";
import { localize } from "../../localize";
import { type IBindingTemplate } from "../../templates/IBindingTemplate";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { getWorkspaceSetting, updateWorkspaceSetting } from "../../vsCodeConfig/settings";

export async function hasRemoteEventGridBlobTrigger(context: IActionContext, node: SlotTreeItem): Promise<boolean> {
    const retries = 3;
    await node.initSite(context);
    const client = await node.site.createClient(context);

    const funcs = await retry<FunctionEnvelope[]>(
        async () => {
            // Load more currently broken https://github.com/Azure/azure-sdk-for-js/issues/20380
            const response = await client.listFunctions();
            const failedToList = localize('failedToList', 'Failed to list functions.');

            // https://github.com/Azure/azure-functions-host/issues/3502
            if (!Array.isArray(response)) {
                throw new Error(failedToList);
            }

            return response;
        },
        { retries, minTimeout: 10 * 1000 }
    );

    return funcs.some(f => {
        const bindings = (f.config as { bindings: IBindingTemplate[] }).bindings;
        return bindings.some(b => b.type === 'blobTrigger');
    });
}

export async function promptForEventGrid(context: IActionContext, workspaceFolder: WorkspaceFolder): Promise<void> {
    const showFlexEventGridWarning = await getWorkspaceSetting('showFlexEventGridWarning');
    if (!showFlexEventGridWarning) {
        return;
    }

    const eventGridWarning = localize(
        'eventGridWarning',
        `Usage of an Event Grid based blob trigger requires an Event Grid subscription created on an Azure Storage v2 account. If you haven't already, you need to create a Event Grid subscription to complete your deployment.`);
    const options: IAzureMessageOptions = { learnMoreLink: 'https://aka.ms/learnMoreEventGridSubscription' };
    const result = await context.ui.showWarningMessage(eventGridWarning, options, { title: 'Close' }, DialogResponses.dontWarnAgain);
    if (result === DialogResponses.dontWarnAgain) {
        await updateWorkspaceSetting('showFlexEventGridWarning', false, workspaceFolder);
    }
}
