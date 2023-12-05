/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ServiceBusManagementClient } from '@azure/arm-servicebus';
import { uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { promptForResource } from '../../../../utils/azure';
import { createServiceBusClient } from '../../../../utils/azureClients';
import { type IServiceBusWizardContext } from './IServiceBusWizardContext';

export class ServiceBusListStep extends AzureWizardPromptStep<IServiceBusWizardContext> {
    public async prompt(context: IServiceBusWizardContext): Promise<void> {
        const placeHolder: string = localize('placeHolder', 'Select a service bus namespace');
        const client: ServiceBusManagementClient = await createServiceBusClient(context);
        context.sbNamespace = await promptForResource(context, placeHolder,
            uiUtils.listAllIterator(client.namespaces.list()));
    }

    public shouldPrompt(context: IServiceBusWizardContext): boolean {
        return !context.sbNamespace;
    }
}
