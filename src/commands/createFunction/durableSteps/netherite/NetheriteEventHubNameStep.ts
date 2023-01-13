/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Eventhub, EventHubManagementClient } from '@azure/arm-eventhub';
import { getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, ISubscriptionContext, nonNullValue } from '@microsoft/vscode-azext-utils';
import { ConnectionType } from '../../../../constants';
import { getInvalidLengthMessage, invalidLowerCaseAlphanumericWithHyphens } from '../../../../constants-nls';
import { localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { validateUtils } from '../../../../utils/validateUtils';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext';

export class NetheriteEventHubNameStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private _eventHubs: Eventhub[] = [];

    public async prompt(context: T): Promise<void> {
        // Prep to check name availability, else it must be new and we can skip the name availability check
        if (context.eventHubsNamespace) {
            const client: EventHubManagementClient = await createEventHubClient(<T & ISubscriptionContext>context);
            const rgName: string = getResourceGroupFromId(nonNullValue(context.eventHubsNamespace.id));
            const ehNamespaceName: string = nonNullValue(context.eventHubsNamespace.name);

            const eventHubIterator = client.eventHubs.listByNamespace(rgName, ehNamespaceName);
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
        return !context.newEventHubName && context.eventHubsConnectionType === ConnectionType.Azure;
    }

    private _validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name, 1, 256)) {
            return getInvalidLengthMessage(1, 256);
        }
        if (!validateUtils.isLowerCaseAlphanumericWithHypens(name)) {
            return invalidLowerCaseAlphanumericWithHyphens;
        }

        const isNameAvailable: boolean = !this._eventHubs.some(eh => eh.name === name);
        if (!isNameAvailable) {
            return localize('eventHubExists', 'An event hub with the name "{0}" already exists.', name);
        }

        return undefined;
    }
}
