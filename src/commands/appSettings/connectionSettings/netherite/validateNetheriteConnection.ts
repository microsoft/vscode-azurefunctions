/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { type EHNamespace, type Eventhub, type EventHubManagementClient } from "@azure/arm-eventhub";
import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { LocationListStep, parseAzureResourceId } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, nonNullValueAndProp, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { CodeAction, ConnectionType } from "../../../../constants";
import { localize } from "../../../../localize";
import { createActivityContext } from "../../../../utils/activityUtils";
import { createEventHubClient } from "../../../../utils/azureClients";
import { type IFuncDeployContext } from "../../../deploy/deploy";
import { type IEventHubsSetSettingsContext } from "../ISetConnectionSettingContext";
import { EventHubsConnectionListStep } from "./EventHubsConnectionListStep";
import { type INetheriteAzureConnectionWizardContext } from "./INetheriteConnectionWizardContext";
import { EventHubNameStep } from "./azure/EventHubNameStep";
import { getNetheriteLocalSettingsValues, getNetheriteSettingsKeys } from "./getNetheriteLocalProjectConnections";

type NetheriteConnectionContext = IFuncDeployContext & ISubscriptionActionContext;

/**
 * A pre-flight deployment operation that ensures that:
 *
 * a) Remote event hub connections already exist for the given function app or
 *
 * b) That new event hub resources are created and ready for connection to the function app
 */
export async function validateNetheriteConnection(context: NetheriteConnectionContext, appSettings: StringDictionary, site: ParsedSite, projectPath: string): Promise<IEventHubsSetSettingsContext | undefined> {
    const { eventHubsNamespaceConnectionKey, eventHubConnectionKey } = await getNetheriteSettingsKeys(Object.assign(context, { projectPath })) ?? {};
    const {
        eventHubsNamespaceConnectionValue: localNamespaceConnection,
        eventHubConnectionValue: localHubConnection,
    } = await getNetheriteLocalSettingsValues(context, { eventHubsNamespaceConnectionKey, eventHubConnectionKey }) ?? {};

    const remoteNamespaceConnection: string | undefined = eventHubsNamespaceConnectionKey ? appSettings?.properties?.[eventHubsNamespaceConnectionKey] : undefined;
    const remoteHubConnection: string | undefined = eventHubConnectionKey ? appSettings?.properties?.[eventHubConnectionKey] : localHubConnection /** The host.json value */;

    if (remoteNamespaceConnection && remoteHubConnection) {
        return undefined;
    }

    const localNamespaceName: string | undefined = parseEventHubsNamespaceName(localNamespaceConnection);
    const eventHubsNamespace: EHNamespace | undefined = await tryGetEventHubsNamespace(context, parseEventHubsNamespaceName(remoteNamespaceConnection));

    const availableDeployConnectionTypes = new Set([ConnectionType.Azure]) satisfies Set<Exclude<ConnectionType, 'Custom'>>;

    const wizardContext: INetheriteAzureConnectionWizardContext = {
        ...context,
        ...await createActivityContext(),
        projectPath,
        action: CodeAction.Deploy,
        eventHubsConnectionType: ConnectionType.Azure,
        eventHubsNamespace,
        eventHub: await tryGetEventHub(context, eventHubsNamespace, localHubConnection),
        newEventHubsNamespaceConnectionSettingKey: eventHubsNamespaceConnectionKey,
        newEventHubConnectionSettingKey: eventHubConnectionKey,
        suggestedNamespaceLocalSettings: localNamespaceName,
        suggestedEventHubLocalSettings: localHubConnection,
    };

    LocationListStep.resetLocation(wizardContext);
    await LocationListStep.setAutoSelectLocation(wizardContext, site.location);

    const wizard: AzureWizard<INetheriteAzureConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('prepareNetheriteConnection', 'Prepare Netherite connections'),
        promptSteps: [new EventHubsConnectionListStep(availableDeployConnectionTypes)],
        showLoadingPrompt: true,
    });

    await wizard.prompt();
    await wizard.execute();

    return {
        newEventHubsNamespaceConnectionSettingKey: wizardContext.newEventHubsNamespaceConnectionSettingKey,
        newEventHubsNamespaceConnectionSettingValue: wizardContext.newEventHubsNamespaceConnectionSettingValue,
        newEventHubConnectionSettingKey: wizardContext.newEventHubConnectionSettingKey,
        newEventHubConnectionSettingValue: wizardContext.newEventHubConnectionSettingValue,
    };
}

// Connection example: Endpoint=sb://myeventhubsnamespace.servicebus.windows.net/;SharedAccessKeyName=....
export function parseEventHubsNamespaceName(eventHubsConnection?: string): string | undefined {
    if (!eventHubsConnection) {
        return undefined;
    }

    const match = eventHubsConnection.match(/Endpoint=sb:\/\/(.*?)\.servicebus\.windows\.net\//);
    return match ? match[1] : undefined;
}

export async function tryGetEventHubsNamespace(context: NetheriteConnectionContext, namespaceName?: string): Promise<EHNamespace | undefined> {
    if (!namespaceName) {
        return undefined;
    }

    try {
        const client: EventHubManagementClient = await createEventHubClient(context);
        const resourceGroupName: string = nonNullValueAndProp(context.resourceGroup, 'name');
        return await client.namespaces.get(resourceGroupName, namespaceName);
    } catch {
        return undefined;
    }
}

export async function tryGetEventHub(context: NetheriteConnectionContext, namespace?: EHNamespace, eventHubName?: string): Promise<Eventhub | undefined> {
    if (!namespace?.id || !eventHubName) {
        return undefined;
    }

    const parsedResource = parseAzureResourceId(namespace.id);
    return await EventHubNameStep.getEventHub(context, parsedResource.resourceGroup, parsedResource.resourceName, eventHubName);
}
