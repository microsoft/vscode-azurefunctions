/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { type ParsedSite, type SiteClient } from "@microsoft/vscode-azext-azureappservice";
import { LocationListStep, ResourceGroupListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, parseError, type IParsedError, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { CodeAction, ConnectionKey, ConnectionType } from "../../../../constants";
import { ext } from "../../../../extensionVariables";
import { getLocalSettingsConnectionString } from "../../../../funcConfig/local.settings";
import { localize } from "../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerResource } from "../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { createActivityContext } from "../../../../utils/activityUtils";
import { type IFuncDeployContext } from "../../../deploy/deploy";
import { DTSConnectionListStep } from "./DTSConnectionListStep";
import { type IDTSAzureConnectionWizardContext } from "./IDTSConnectionWizardContext";

type DTSConnectionContext = IFuncDeployContext & ISubscriptionActionContext & { subscription: AzureSubscription };
type DTSConnection = { [ConnectionKey.DTS]?: string, [ConnectionKey.DTSHub]?: string };

/**
 * A pre-flight operation that ensures that:
 *
 * a) A remote DTS connection already exists for the given function app or
 *
 * b) That a new DTS resource and hub is created and ready for connection to the function app
 */
export async function getDTSConnectionIfNeeded(context: DTSConnectionContext, client: SiteClient, site: ParsedSite, projectPath: string): Promise<DTSConnection | undefined> {
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

    const wizardContext: IDTSAzureConnectionWizardContext = {
        ...context,
        ...await createActivityContext(),
        site,
        projectPath,
        action: CodeAction.Deploy,
        dtsConnectionType: ConnectionType.Azure,
        dts: remoteDTSEndpoint ? await getDTSResource(context, remoteDTSEndpoint) : undefined,
        // Local settings connection string could point to a useable remote resource, so try to suggest it if one is detected.
        // If the local settings are pointing to an emulator (i.e. localhost), it's not a concern because it won't actually match up with any remote resources and thus won't show up as a suggestion.
        suggestedDTSEndpointLocalSettings: localDTSEndpoint ? tryGetDTSEndpoint(localDTSConnection) : undefined,
        suggestedDTSHubNameLocalSettings: localDTSHubName,
    };

    // Always reset location to avoid potential mismatches with the Durable Task provider offering. If a location was already set and is not valid for this resource type, deployment may fail.
    LocationListStep.resetLocation(wizardContext);
    await LocationListStep.setAutoSelectLocation(wizardContext, site.location);

    const wizard: AzureWizard<IDTSAzureConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('prepareDTSConnection', 'Prepare durable task scheduler connection'),
        promptSteps: [
            new ResourceGroupListStep(),
            new DTSConnectionListStep(availableDeployConnectionTypes),
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

async function getDTSResource(context: DTSConnectionContext, dtsEndpoint: string): Promise<DurableTaskSchedulerResource | undefined> {
    try {
        const client = new HttpDurableTaskSchedulerClient();
        const schedulers: DurableTaskSchedulerResource[] = await client.getSchedulersBySubscription(context.subscription) ?? [];
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
