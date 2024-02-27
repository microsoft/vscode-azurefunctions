/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IAppServiceWizardContext } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizard, nonNullProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { ResolvedFunctionAppResource } from "../../tree/ResolvedFunctionAppResource";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { type SubscriptionTreeItem } from "../../tree/SubscriptionTreeItem";
import { type IFunctionAppWizardContext } from "../createFunctionApp/IFunctionAppWizardContext";
import { FunctionAppListStep } from "./FunctionAppListStep";
import { type IFuncDeployContext } from "./deploy";

export async function getOrCreateFunctionApp(context: IFuncDeployContext & Partial<IFunctionAppWizardContext>): Promise<SlotTreeItem> {
    let node: SlotTreeItem | undefined;

    const subId = '/subscriptions/9b5c7ccb-9857-4307-843b-8875e83f65e9';
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const subscription = (await ext.rgApi.tree.findTreeItem(subId, context))! as SubscriptionTreeItem;

    const promptSteps = [new FunctionAppListStep()];
    context = Object.assign(context, subscription.subscription);

    const title: string = localize('functionAppSelectTitle', 'Select Function App');
    const wizard: AzureWizard<IAppServiceWizardContext> = new AzureWizard(context, {
        promptSteps,
        title
    });

    await wizard.prompt();

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    node = context.site ? await ext.rgApi.tree.findTreeItem(context.site!.id!, context)! : undefined;

    if (!node) {
        context.activityTitle = localize('functionAppCreateActivityTitle', 'Create Function App "{0}"', nonNullProp(context, 'newSiteName'))
        await wizard.execute();

        const resolved = new ResolvedFunctionAppResource(subscription.subscription, nonNullProp(context, 'site'));
        await ext.rgApi.tree.refresh(context);

        node = await ext.rgApi.tree.findTreeItem(resolved.id, context);
        context.isNewApp = true;
    }

    if (!node) {
        throw new Error('Could not find or create Function App node.');
    }

    return node;
}
