/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EventHubManagementClient } from '@azure/arm-eventhub';
import { AzureWizardPromptStep, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { getInvalidLengthMessage, invalidAlphanumericWithHyphens } from '../../../../constants-nls';
import { localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { validateUtils } from '../../../../utils/validateUtils';
import { type IEventHubsConnectionWizardContext } from '../../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext';

export class EventHubsNamespaceNameStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private client: EventHubManagementClient;

    public async prompt(context: T): Promise<void> {
        this.client = await createEventHubClient(<T & ISubscriptionContext>context);
        context.newEventHubsNamespaceName = (await context.ui.showInputBox({
            prompt: localize('eventHubNamePrompt', 'Enter a name for the new event hubs namespace.'),
            validateInput: (value: string | undefined) => this.validateInput(value),
            asyncValidationTask: (value: string) => this.isNameAvailable(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsNamespace && !context.newEventHubsNamespaceName;
    }

    private async validateInput(name: string | undefined): Promise<string | undefined> {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name, 6, 50)) {
            return getInvalidLengthMessage(6, 50);
        }
        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }
        return undefined;
    }

    private async isNameAvailable(name: string): Promise<string | undefined> {
        name = name.trim();

        const isAvailable: boolean = !!(await this.client.namespaces.checkNameAvailability({ name })).nameAvailable;
        if (!isAvailable) {
            return localize('eventHubNamespaceExists', 'The event hub namespace you entered already exists. Please enter a unique name.');
        }
        return undefined;
    }
}
