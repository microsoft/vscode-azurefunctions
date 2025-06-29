/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Eventhub, type EventHubManagementClient } from '@azure/arm-eventhub';
import { parseAzureResourceId } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullValueAndProp, validationUtils, type ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';
import { invalidAlphanumericWithHyphens } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createEventHubClient } from '../../../../../utils/azureClients';
import { validateUtils } from '../../../../../utils/validateUtils';
import { type INetheriteAzureConnectionWizardContext } from '../INetheriteConnectionWizardContext';

export class EventHubNameStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newEventHubName = (await context.ui.showInputBox({
            prompt: localize('eventHubNamePrompt', 'Enter a name for the event hub.'),
            value: context.suggestedEventHubLocalSettings ?? "MyTaskHub", // This is the default used in the ms learn docs
            validateInput: this.validateInput,
            asyncValidationTask: (name: string) => this.isNameAvailable(context, name),
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newEventHubName;
    }

    private validateInput(name: string = ''): string | undefined {
        name = name.trim();

        const rc: validationUtils.RangeConstraints = { upperLimitIncl: 256 };
        if (!validationUtils.hasValidCharLength(name, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
        }

        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }

        return undefined;
    }

    private async isNameAvailable(context: T, name: string = ''): Promise<string | undefined> {
        if (!context.eventHubsNamespace) {
            return undefined;
        }

        name = name.trim();

        const parseResource = parseAzureResourceId(nonNullValueAndProp(context.eventHubsNamespace, 'id'));
        const eventHub: Eventhub | undefined = await EventHubNameStep.getEventHub(
            context,
            parseResource.resourceGroup,
            parseResource.resourceName,
            name,
        );

        if (eventHub) {
            return localize('eventHubExists', 'Event hub with name "{0}" already exists in namespace "{1}".', name, context.eventHubsNamespace.name);
        }

        return undefined;
    }

    public static async getEventHub(context: ISubscriptionActionContext, resourceGroup: string, namespace: string, eventHub: string): Promise<Eventhub | undefined> {
        try {
            const client: EventHubManagementClient = await createEventHubClient(context);
            return await client.eventHubs.get(resourceGroup, namespace, eventHub);
        } catch {
            return undefined;
        }
    }
}
