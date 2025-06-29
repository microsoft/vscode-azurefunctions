/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { EventHubsConnectionListStep } from "../../commands/appSettings/connectionSettings/netherite/EventHubsConnectionListStep";
import { getNetheriteLocalSettingsValues, getNetheriteSettingsKeys } from "../../commands/appSettings/connectionSettings/netherite/getNetheriteLocalProjectConnections";
import { type INetheriteConnectionWizardContext } from "../../commands/appSettings/connectionSettings/netherite/INetheriteConnectionWizardContext";
import { parseEventHubsNamespaceName } from "../../commands/appSettings/connectionSettings/netherite/validateNetheriteConnection";
import { CodeAction, ConnectionType } from "../../constants";
import { localize } from "../../localize";
import { createActivityContext } from "../../utils/activityUtils";

export async function validateNetheriteConnectionPreDebug(context: IActionContext, projectPath: string): Promise<void> {
    const projectPathContext = Object.assign(context, { projectPath });
    const { eventHubsNamespaceConnectionKey, eventHubConnectionKey } = await getNetheriteSettingsKeys(projectPathContext) ?? {};
    const {
        eventHubsNamespaceConnectionValue: eventHubsConnection,
        eventHubConnectionValue: eventHubName,
    } = await getNetheriteLocalSettingsValues(projectPathContext, { eventHubsNamespaceConnectionKey, eventHubConnectionKey }) ?? {};

    if (!!eventHubsConnection && !!eventHubName) {
        return;
    }

    const availableDebugConnectionTypes = new Set([ConnectionType.Azure, ConnectionType.Emulator]) satisfies Set<Exclude<ConnectionType, 'Custom'>>;

    const wizardContext: INetheriteConnectionWizardContext = {
        ...context,
        ...await createActivityContext(),
        projectPath,
        action: CodeAction.Debug,
        newEventHubsNamespaceConnectionSettingKey: eventHubsNamespaceConnectionKey,
        newEventHubConnectionSettingKey: eventHubConnectionKey,
        newEventHubsNamespaceConnectionSettingValue: eventHubsConnection,
        newEventHubConnectionSettingValue: eventHubName,
        suggestedNamespaceLocalSettings: parseEventHubsNamespaceName(eventHubsConnection),
    };

    const wizard: AzureWizard<INetheriteConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('prepareNetheriteDebug', 'Prepare Netherite debug configuration'),
        promptSteps: [new EventHubsConnectionListStep(availableDebugConnectionTypes)],
        showLoadingPrompt: true,
    });

    await wizard.prompt();
    await wizard.execute();
}
