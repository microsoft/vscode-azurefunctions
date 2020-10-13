/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceBusManagementClient } from '@azure/arm-servicebus';
import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { localize } from '../../../../localize';
import { promptForResource } from '../../../../utils/azure';
import { createServiceBusClient } from '../../../../utils/azureClients';
import { IServiceBusWizardContext } from './IServiceBusWizardContext';

export class ServiceBusListStep extends AzureWizardPromptStep<IServiceBusWizardContext> {
    public async prompt(context: IServiceBusWizardContext): Promise<void> {
        const placeHolder: string = localize('placeHolder', 'Select a service bus namespace');
        const client: ServiceBusManagementClient = await createServiceBusClient(context);
        context.sbNamespace = await promptForResource(placeHolder, client.namespaces.list());
    }

    public shouldPrompt(context: IServiceBusWizardContext): boolean {
        return !context.sbNamespace;
    }
}
