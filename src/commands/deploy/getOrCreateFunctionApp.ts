/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IAppServiceWizardContext } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizard, nonNullProp, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { l10n } from "vscode";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { ResolvedFunctionAppResource } from "../../tree/ResolvedFunctionAppResource";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { ResolvedContainerizedFunctionAppResource } from "../../tree/containerizedFunctionApp/ResolvedContainerizedFunctionAppResource";
import { SubscriptionListStep } from "../SubscriptionListStep";
import { type IFunctionAppWizardContext } from "../createFunctionApp/IFunctionAppWizardContext";
import { FunctionAppListStep } from "./FunctionAppListStep";
import { type IFuncDeployContext } from "./deploy";

export async function getOrCreateFunctionApp(context: IFuncDeployContext & Partial<IFunctionAppWizardContext>): Promise<SlotTreeItem> {
    let node: SlotTreeItem | undefined;
    const wizard: AzureWizard<IAppServiceWizardContext> = new AzureWizard(context, {
        promptSteps: [new SubscriptionListStep(), new FunctionAppListStep()],
        title: l10n.t('Select Function App')
    });

    await wizard.prompt();

    node = context.site ? await ext.rgApi.tree.findTreeItem(nonNullProp(context.site, 'id'), context) : undefined;

    // if there was no node, then the user is creating a new function app
    if (!node) {
        context.activityTitle = localize('functionAppCreateActivityTitle', 'Create Function App "{0}"', nonNullProp(context, 'newSiteName'))
        await wizard.execute();

        if (context.dockerfilePath) {
            const resolved = new ResolvedContainerizedFunctionAppResource(context as ISubscriptionContext, nonNullProp(context, 'site'))
            node = await ext.rgApi.tree.findTreeItem(resolved.id, context);
        } else {
            const resolved = new ResolvedFunctionAppResource(context as ISubscriptionContext, nonNullProp(context, 'site'));
            node = await ext.rgApi.tree.findTreeItem(resolved.id, context);
        }

        await ext.rgApi.tree.refresh(context);

        context.isNewApp = true;
    }

    if (!node) {
        throw new Error(l10n.t('Could not find function app "{0}".', context.site?.name ?? ''));
    }

    return node;
}
