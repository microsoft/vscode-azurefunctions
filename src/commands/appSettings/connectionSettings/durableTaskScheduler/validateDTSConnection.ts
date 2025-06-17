/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { type SiteClient } from "@microsoft/vscode-azext-azureappservice";
import { ResourceGroupListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, nonNullValueAndProp, parseError, type IParsedError, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { CodeAction, ConnectionKey, ConnectionType } from "../../../../constants";
import { ext } from "../../../../extensionVariables";
import { getLocalSettingsConnectionString } from "../../../../funcConfig/local.settings";
import { localize } from "../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerResource } from "../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { createActivityContext } from "../../../../utils/activityUtils";
import { type IFuncDeployContext } from "../../../deploy/deploy";
import { DTSConnectionTypeListStep } from "./DTSConnectionTypeListStep";
import { type IDTSAzureConnectionWizardContext } from "./IDTSConnectionWizardContext";

type DTSConnectionContext = IFuncDeployContext & ISubscriptionActionContext & { subscription: AzureSubscription };
type DTSConnection = { [ConnectionKey.DTS]?: string, [ConnectionKey.DTSHub]?: string };

export async function validateDTSConnection(context: DTSConnectionContext, client: SiteClient, projectPath: string): Promise<DTSConnection | undefined> {
    const app: StringDictionary = await client.listApplicationSettings();

    const remoteDTSConnection: string | undefined = app?.properties?.[ConnectionKey.DTS];
    const remoteDTSHubName: string | undefined = app?.properties?.[ConnectionKey.DTSHub];

    if (remoteDTSConnection && remoteDTSHubName) {
        return undefined;
    }

    const localDTSConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.DTS, projectPath);
    const localDTSHubName: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.DTSHub, projectPath);
    const localDTSEndpoint: string | undefined = tryGetDTSEndpoint(localDTSConnection);

    const remoteDTSEndpoint: string | undefined = tryGetDTSEndpoint(remoteDTSConnection);
    const availableDeployConnectionTypes = new Set([ConnectionType.Azure]);

    // Spread the properties onto a new wizardContext so that we can initiate a separate activity log entry
    const wizardContext: IDTSAzureConnectionWizardContext = {
        ...context,
        ...await createActivityContext(),
        projectPath,
        action: CodeAction.Deploy,
        dtsConnectionType: ConnectionType.Azure,
        dts: remoteDTSEndpoint ? await getDTSResource(context, remoteDTSEndpoint) : undefined,
        // If the local settings are using the emulator (i.e. localhost), it's fine because it won't match up with any remote resources and the suggestion will end up hidden from the user
        suggestedDTSEndpointLocalSettings: localDTSEndpoint ? tryGetDTSEndpoint(localDTSConnection) : undefined,
        suggestedDTSHubNameLocalSettings: localDTSHubName,
    };

    const wizard: AzureWizard<IDTSAzureConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('getDTSResources', 'Get Durable Task Scheduler resources'),
        promptSteps: [
            new ResourceGroupListStep(),
            new DTSConnectionTypeListStep(availableDeployConnectionTypes),
        ],
        showLoadingPrompt: true,
    });

    await wizard.prompt();
    await wizard.execute();

    return {
        [ConnectionKey.DTS]: wizardContext[ConnectionKey.DTS],
        [ConnectionKey.DTSHub]: wizardContext[ConnectionKey.DTSHub],
    };
}

// Check function app for user assigned identity,
// 1. if exists, assign it to context
// 2. If it doesn't exist we need to either select or create a new user assigned identity.  Do we need to prompt for managed identity vs. secret - Lily said only MI connection supported
// For this bottom choice we can probably follow whatever the create function app logic is doing

// After creating the new DTS, add a step to assign the Durable Task Scheduler Contributor role to the user assigned identity
// If not creating a new DTS, you can skip this
// After adding the role, we need to set the new connection for DTS which should include the client ID for the connection string

async function getDTSResource(context: DTSConnectionContext, dtsEndpoint: string): Promise<DurableTaskSchedulerResource | undefined> {
    try {
        const client = new HttpDurableTaskSchedulerClient();
        const schedulers: DurableTaskSchedulerResource[] = await client.getSchedulers(context.subscription, nonNullValueAndProp(context.resourceGroup, 'name')) ?? [];
        return schedulers.find(s => s.properties.endpoint === dtsEndpoint);
    } catch (e) {
        const pe: IParsedError = parseError(e);
        ext.outputChannel.appendLog(localize('failedToFetchDTS', 'Failed to fetch remote DTS resource with endpoint: "{0}"', dtsEndpoint));
        ext.outputChannel.appendLog(pe.message);
        return undefined;
    }
}

// Example connection: "Endpoint=https://mwf-dts1-cghxbwa9drf6bzh.westus2.durabletask.io;Authentication=ManagedIdentity;ClientID=<ClientID>"
// Example endpoint: "https://mwf-dts1-cghxbwa9drf6bzh.westus2.durabletask.io"
function tryGetDTSEndpoint(dtsConnection: string | undefined): string | undefined {
    if (!dtsConnection) {
        return undefined;
    }

    const endpointMatch = dtsConnection.match(/Endpoint=([^;]+)/);
    if (!endpointMatch) {
        return undefined;
    }

    return endpointMatch[1];
}
