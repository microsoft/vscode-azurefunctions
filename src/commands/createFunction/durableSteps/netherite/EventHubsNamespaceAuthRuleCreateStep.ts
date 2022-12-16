/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthorizationRule, EventHubManagementClient } from '@azure/arm-eventhub';
import { getResourceGroupFromId } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, ISubscriptionContext, nonNullProp, nonNullValue } from '@microsoft/vscode-azext-utils';
import { Progress } from 'vscode';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext';

export class EventHubsNamespaceAuthRuleCreateStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 250;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const client: EventHubManagementClient = await createEventHubClient(<T & ISubscriptionContext>context);
        const rgName: string = getResourceGroupFromId(nonNullValue(context.eventHubsNamespace?.id));
        const namespaceName: string = nonNullValue(context.eventHubsNamespace?.name);
        const authRuleName: string = nonNullProp(context, 'newAuthRuleName');
        const defaultParams: AuthorizationRule = { rights: ['Manage', 'Send', 'Listen'] };

        const creating: string = localize('creatingAuthRule', 'Creating new access policy "{0}"...', authRuleName);
        ext.outputChannel.appendLog(creating);
        progress.report({ message: creating });

        context.authRule = await client.namespaces.createOrUpdateAuthorizationRule(rgName, namespaceName, authRuleName, defaultParams);
    }

    public shouldExecute(context: T): boolean {
        return !context.authRule;
    }
}
