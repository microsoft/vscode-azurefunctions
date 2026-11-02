/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDeployNode } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizard, PickTreeItemWithCompatibility, nonNullProp, nonNullValueAndProp, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { ProgressLocation, l10n, window, type Uri } from "vscode";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { ResolvedFunctionAppResource } from "../../tree/ResolvedFunctionAppResource";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { ResolvedContainerizedFunctionAppResource } from "../../tree/containerizedFunctionApp/ResolvedContainerizedFunctionAppResource";
import { pickFunctionApp } from "../../utils/pickFunctionApp";
import { treeUtils } from "../../utils/treeUtils";
import { SubscriptionListStep } from "../SubscriptionListStep";
import { type IFunctionAppWizardContext } from "../createFunctionApp/IFunctionAppWizardContext";
import { FunctionAppListStep } from "./FunctionAppListStep";
import { type IFuncDeployContext } from "./deploy";

export async function getFunctionAppToDeploy(context: IFuncDeployContext, arg1: Uri | string | SlotTreeItem | undefined, arg2: string | {} | undefined, expectedContextValue?: string | RegExp): Promise<SlotTreeItem> {
    if (treeUtils.isAzExtTreeItem(arg1)) {
        if (!arg1.contextValue.match(ResolvedFunctionAppResource.pickSlotContextValue) &&
            !arg1.contextValue.match(ResolvedFunctionAppResource.productionContextValue) &&
            !arg1.contextValue.match(ResolvedFunctionAppResource.flexContextValue)) {
            // The deploy button can pass a local project node rather than a deployment target.
            arg1 = undefined;
        }
    }

    const node: SlotTreeItem = await getDeployNode(context, ext.rgApi.tree, arg1, arg2, async () => {
        return expectedContextValue ?
            await pickFunctionApp(context, { expectedChildContextValue: expectedContextValue }) :
            await getOrCreateFunctionApp(context);
    });

    if (!expectedContextValue || node.contextValue.match(expectedContextValue)) {
        return node;
    }

    // Supplied/default targets are unwrapped, so traverse their owning branch rather than the Resources wrapper tree.
    const slot = await PickTreeItemWithCompatibility.showTreeItemPicker<SlotTreeItem>(context, node.treeDataProvider, expectedContextValue, node);
    if (!slot.contextValue.match(expectedContextValue)) {
        throw new Error(l10n.t('The selected deployment target is not a deployment slot.'));
    }

    return slot;
}

export async function getOrCreateFunctionApp(context: IFuncDeployContext & Partial<IFunctionAppWizardContext>): Promise<SlotTreeItem> {
    let node: SlotTreeItem | undefined;
    const wizard = new AzureWizard<IFuncDeployContext & Partial<IFunctionAppWizardContext>>(context, {
        promptSteps: [new SubscriptionListStep(), new FunctionAppListStep()],
        title: l10n.t('Select Function App')
    });

    await wizard.prompt();

    if (context.site) {
        await window.withProgress({ location: ProgressLocation.Notification, cancellable: false, title: localize('deploySetUp', 'Loading deployment configurations...') },
            async () => {
                node = await ext.rgApi.tree.findTreeItem(nonNullValueAndProp(context.site, 'id'), context);
            });
    } else {
        node = undefined;
    }

    // if there was no node, then the user is creating a new function app
    if (!node) {
        context.activityTitle = localize('functionAppCreateActivityTitle', 'Create Function App "{0}"', nonNullProp(context, 'newSiteName'));
        context.disableSharedKeyAccess = context.useManagedIdentity && context.useFlexConsumptionPlan;
        await wizard.execute();

        const resolved = context.dockerfilePath ? new ResolvedContainerizedFunctionAppResource(context as ISubscriptionContext, nonNullProp(context, 'site')) :
            new ResolvedFunctionAppResource(context as ISubscriptionContext, nonNullProp(context, 'site'));
        node = await ext.rgApi.tree.findTreeItem(resolved.id, context);

        await ext.rgApi.tree.refresh(context);

        context.isNewApp = true;
    }

    if (!node) {
        throw new Error(l10n.t('Could not find function app "{0}".', context.site?.name ?? ''));
    }

    return node;
}
