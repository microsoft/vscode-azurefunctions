/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHubManagementClient } from '@azure/arm-eventhub';
import { delay } from '@azure/ms-rest-js';
import { AzureWizardPromptStep, ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { invalidAlphanumericWithHyphens, invalidLength, localize } from '../../../../localize';
import { createEventHubClient } from '../../../../utils/azureClients';
import { validateUtils } from '../../../../utils/validateUtils';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/IEventHubsConnectionWizardContext';

export class EventHubsNamespaceNameStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private _client: EventHubManagementClient;

    public async prompt(context: T): Promise<void> {
        this._client = await createEventHubClient(<T & ISubscriptionContext>context);
        context.newEventHubsNamespaceName = (await context.ui.showInputBox({
            prompt: localize('eventHubNamePrompt', 'Enter a name for the new event hubs namespace.'),
            validateInput: async (value: string | undefined) => await this._validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsNamespace && !context.newEventHubsNamespaceName;
    }

    private async _validateInput(name: string | undefined): Promise<string | undefined> {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name, 6, 50)) {
            return invalidLength('6', '50');
        }
        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }
        await delay(500);

        const isNameAvailable: boolean = !!(await this._client.namespaces.checkNameAvailability({ name })).nameAvailable;
        if (!isNameAvailable) {
            return localize('eventHubNamespaceExists', 'The event hub namespace you entered already exists. Please enter a unique name.');
        }
        return undefined;
    }
}
