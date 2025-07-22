/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EventHubManagementClient } from '@azure/arm-eventhub';
import { AzureWizardPromptStep, validationUtils } from '@microsoft/vscode-azext-utils';
import { invalidAlphanumericWithHyphens } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createEventHubClient } from '../../../../../utils/azureClients';
import { validateUtils } from '../../../../../utils/validateUtils';
import { type INetheriteAzureConnectionWizardContext } from '../INetheriteConnectionWizardContext';

export class EventHubsNamespaceNameStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private client: EventHubManagementClient;

    public async prompt(context: T): Promise<void> {
        this.client = await createEventHubClient(context);
        context.newEventHubsNamespaceName = (await context.ui.showInputBox({
            prompt: localize('eventHubNamePrompt', 'Enter a name for the new event hubs namespace.'),
            value: context.suggestedNamespaceLocalSettings,
            validateInput: this.validateInput,
            asyncValidationTask: (name: string) => this.isNameAvailable(name),
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newEventHubsNamespaceName;
    }

    private async validateInput(name: string = ''): Promise<string | undefined> {
        name = name.trim();

        const rc: validationUtils.RangeConstraints = { lowerLimitIncl: 6, upperLimitIncl: 50 };
        if (!validationUtils.hasValidCharLength(name, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
        }
        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }
        return undefined;
    }

    private async isNameAvailable(name: string = ''): Promise<string | undefined> {
        name = name.trim();

        const isAvailable: boolean = !!(await this.client.namespaces.checkNameAvailability({ name })).nameAvailable;
        if (!isAvailable) {
            return localize('eventHubNamespaceExists', 'The event hub namespace you entered already exists. Please enter a unique name.');
        }
        return undefined;
    }
}
