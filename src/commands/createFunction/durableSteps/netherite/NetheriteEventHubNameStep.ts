/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Eventhub, EventHubManagementClient } from '@azure/arm-eventhub';
import { parseAzureResourceId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, ISubscriptionContext, nonNullValue } from '@microsoft/vscode-azext-utils';
import { ConnectionType } from '../../../../constants';
import { invalidLength, invalidLowerCaseAlphanumericWithHyphens, localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { validateUtils } from '../../../../utils/validateUtils';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/IEventHubsConnectionWizardContext';


export class NetheriteEventHubNameStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private _eventHubs: Eventhub[] = [];

    public async prompt(context: T): Promise<void> {
        // Prep to check name availability, else it must be new and we can skip the name availability check
        if (context.eventHubsNamespace) {
            const client: EventHubManagementClient = await createEventHubClient(<T & ISubscriptionContext>context);
            const rgName: string = parseAzureResourceId(nonNullValue(context.eventHubsNamespace.id)).resourceGroup;
            const ehNamespaceName: string = nonNullValue(context.eventHubsNamespace.name);

            const eventHubIterator = await client.eventHubs.listByNamespace(rgName, ehNamespaceName);
            this._eventHubs = await uiUtils.listAllIterator(eventHubIterator);
        }

        context.newEventHubName = (await context.ui.showInputBox({
            prompt: localize('eventHubNamePrompt', 'Enter a name for the new event hub.'),
            validateInput: (value: string | undefined) => {
                return this._validateInput(value)
            }
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newEventHubName && context.eventHubConnectionType === ConnectionType.Azure;
    }

    private _validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name, 1, 256)) {
            return invalidLength('1', '256');
        }
        if (!validateUtils.isLowerCaseAlphanumericWithHypens(name)) {
            return invalidLowerCaseAlphanumericWithHyphens;
        }

        const isNameAvailable: boolean = !this._eventHubs.some(eh => eh.name === name);
        if (!isNameAvailable) {
            return localize('eventHubExists', 'The event hub you entered already exists. Please enter a unique name.');
        }

        return undefined;
    }
}
