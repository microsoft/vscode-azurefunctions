/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type WebSiteManagementClient } from '@azure/arm-appservice';
import { type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { SubscriptionTreeItemBase, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, parseError, type AzExtTreeItem, type IActionContext, type ICreateChildImplContext } from '@microsoft/vscode-azext-utils';
import { type WorkspaceFolder } from 'vscode';
import { createCreateFunctionAppComponents } from '../commands/createFunctionApp/createCreateFunctionAppComponents';
import { projectLanguageSetting } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from "../localize";
import { registerProviders } from '../utils/azure';
import { createWebSiteClient } from '../utils/azureClients';
import { nonNullProp } from '../utils/nonNull';
import { getWorkspaceSetting, getWorkspaceSettingFromAnyFolder } from '../vsCodeConfig/settings';
import { ResolvedFunctionAppResource } from './ResolvedFunctionAppResource';
import { SlotTreeItem } from './SlotTreeItem';
import { isProjectCV, isRemoteProjectCV } from './projectContextValues';

export interface ICreateFunctionAppContext extends ICreateChildImplContext {
    newResourceGroupName?: string;
    workspaceFolder?: WorkspaceFolder;
    skipExecute?: boolean;
}

export class SubscriptionTreeItem extends SubscriptionTreeItemBase {
    public readonly childTypeLabel: string = localize('FunctionApp', 'Function App in Azure');
    public supportsAdvancedCreation: boolean = true;

    private _nextLink: string | undefined;

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        // Load more currently broken https://github.com/Azure/azure-sdk-for-js/issues/20380
        const client: WebSiteManagementClient = await createWebSiteClient([context, this.subscription]);
        let webAppCollection: Site[];
        try {
            webAppCollection = await uiUtils.listAllIterator(client.webApps.list());
        } catch (error) {
            if (parseError(error).errorType.toLowerCase() === 'notfound') {
                // This error type means the 'Microsoft.Web' provider has not been registered in this subscription
                // In that case, we know there are no Function Apps, so we can return an empty array
                // (The provider will be registered automatically if the user creates a new Function App)
                return [];
            } else {
                throw error;
            }
        }

        return await this.createTreeItemsWithErrorHandling(
            webAppCollection,
            'azFuncInvalidFunctionApp',
            (site: Site) => {
                const resolved = new ResolvedFunctionAppResource(this.subscription, site);
                if (resolved.site.isFunctionApp) {
                    return new SlotTreeItem(this, resolved);
                }
                return undefined;
            },
            (site: Site) => {
                return site.name;
            }
        );
    }

    public static async createChild(context: ICreateFunctionAppContext, subscription: SubscriptionTreeItem): Promise<SlotTreeItem> {
        const language: string | undefined = context.workspaceFolder ? getWorkspaceSetting(projectLanguageSetting, context.workspaceFolder) : getWorkspaceSettingFromAnyFolder(projectLanguageSetting);
        context.telemetry.properties.projectLanguage = language;

        // Ensure all the providers are registered before
        const registerProvidersTask = registerProviders(context, subscription);


        const { wizardContext, promptSteps, executeSteps } = await createCreateFunctionAppComponents(context, subscription.subscription, language)
        const title: string = localize('functionAppCreatingTitle', 'Create new Function App in Azure');
        const wizard: AzureWizard<IAppServiceWizardContext> = new AzureWizard(wizardContext, {
            promptSteps,
            executeSteps,
            title,
            showLoadingPrompt: context.skipExecute !== true,
            skipExecute: context.skipExecute === true
        });

        await wizard.prompt();
        // if the providers aren't registered yet, await it here because it is required by this point
        await registerProvidersTask;
        // move this into create function app step
        wizardContext.activityTitle = localize('functionAppCreateActivityTitle', 'Create Function App "{0}"', nonNullProp(wizardContext, 'newSiteName'))
        await wizard.execute();

        const resolved = new ResolvedFunctionAppResource(subscription.subscription, nonNullProp(wizardContext, 'site'));
        await ext.rgApi.tree.refresh(context);
        return new SlotTreeItem(subscription, resolved);
    }

    public isAncestorOfImpl(contextValue: string | RegExp): boolean {
        return !isProjectCV(contextValue) || isRemoteProjectCV(contextValue);
    }
}
