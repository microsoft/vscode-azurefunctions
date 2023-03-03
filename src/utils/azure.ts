/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppKind, IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { VerifyProvidersStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, AzureWizardExecuteStep, IActionContext, IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { isArray } from 'util';
import { IFunctionAppWizardContext } from '../commands/createFunctionApp/IFunctionAppWizardContext';
import { webProvider } from '../constants';
import { localize } from '../localize';
import { ICreateFunctionAppContext, SubscriptionTreeItem } from '../tree/SubscriptionTreeItem';

export interface IBaseResourceWithName {
    name?: string;
    _description?: string;
}

export async function promptForResource<T extends IBaseResourceWithName>(context: IActionContext, placeHolder: string, resourcesTask: Promise<T[]>): Promise<T | undefined> {
    const picksTask: Promise<IAzureQuickPickItem<T | undefined>[]> = resourcesTask.then((resources: T[]) => {
        const picks: IAzureQuickPickItem<T | undefined>[] = !isArray(resources) ? [] : <IAzureQuickPickItem<T>[]>(resources
            .map((r: T) => r.name ? { data: r, label: r.name, description: r._description } : undefined)
            .filter((p: IAzureQuickPickItem<T> | undefined) => p));
        picks.push({
            label: picks.length ? localize('skipForNow', '$(clock) Skip for now') : localize('skippedNoResources', '$(warning) Skipped because no matching resource was found'),
            data: undefined,
            suppressPersistence: true
        });
        return picks;
    });

    const data: T | undefined = (await context.ui.showQuickPick(picksTask, { placeHolder })).data;
    if (data?.name) {
        context.valuesToMask.push(data.name);
    }
    return data;
}

export async function registerProviders(context: ICreateFunctionAppContext, subscription: SubscriptionTreeItem): Promise<void> {
    const providerContext: IAppServiceWizardContext = Object.assign(context, subscription.subscription, {
        newSiteKind: AppKind.functionapp,
    });

    const storageProvider = 'Microsoft.Storage';
    const providerExecuteSteps: AzureWizardExecuteStep<IAppServiceWizardContext>[] =
        [new VerifyProvidersStep([webProvider, storageProvider, 'Microsoft.Insights', 'Microsoft.OperationalInsights'])];
    const providerWizard: AzureWizard<IFunctionAppWizardContext> = new AzureWizard(providerContext, { executeSteps: providerExecuteSteps });

    await providerWizard.execute();
}
