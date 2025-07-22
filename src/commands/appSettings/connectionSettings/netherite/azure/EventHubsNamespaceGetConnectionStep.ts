/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AccessKeys, type EHNamespace, type EventHubManagementClient } from '@azure/arm-eventhub';
import { parseAzureResourceId } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { localSettingsFileName } from '../../../../../constants';
import { ext } from '../../../../../extensionVariables';
import { localize } from '../../../../../localize';
import { createEventHubClient } from '../../../../../utils/azureClients';
import { type INetheriteAzureConnectionWizardContext } from '../INetheriteConnectionWizardContext';

export class EventHubsNamespaceGetConnectionStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 235;

    public async execute(context: T): Promise<void> {
        const client: EventHubManagementClient = await createEventHubClient(context);
        const namespace: EHNamespace = nonNullProp(context, 'eventHubsNamespace');

        const parsedResource = parseAzureResourceId(nonNullProp(namespace, 'id'));
        const authRuleName: string = nonNullValueAndProp(context.authRule, 'name');

        const accessKeys: AccessKeys = await client.namespaces.listKeys(parsedResource.resourceGroup, parsedResource.resourceName, authRuleName);
        if (!accessKeys.primaryConnectionString && !accessKeys.secondaryConnectionString) {
            const learnMoreLink: string = 'https://aka.ms/event-hubs-connection-string';
            const message: string = localize('missingEventHubsConnectionString', 'There are no connection strings available on your namespace\'s shared access policy. Locate a valid access policy and add the connection string to "{0}".', localSettingsFileName);
            void context.ui.showWarningMessage(message, { learnMoreLink });
            ext.outputChannel.appendLog(message);
        }

        context.newEventHubsNamespaceConnectionSettingValue = accessKeys.primaryConnectionString || accessKeys.secondaryConnectionString || '';
    }

    public shouldExecute(context: T): boolean {
        return !!context.eventHubsNamespace && !!context.authRule;
    }
}
