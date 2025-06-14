/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { type SiteClient } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizard, nonNullValue, nonNullValueAndProp, parseError, type IParsedError, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { CodeAction, ConnectionKey, ConnectionType } from "../../../../constants";
import { ext } from "../../../../extensionVariables";
import { getLocalSettingsConnectionString } from "../../../../funcConfig/local.settings";
import { localize } from "../../../../localize";
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerResource } from "../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type IFuncDeployContext } from "../../../deploy/deploy";
import { DTSConnectionTypeListStep } from "./DTSConnectionTypeListStep";
import { type IDTSAzureConnectionWizardContext } from "./IDTSConnectionWizardContext";

type ValidateDTSConnectionContext = IFuncDeployContext & ISubscriptionActionContext & { subscription: AzureSubscription };

export async function validateDTSConnection(context: ValidateDTSConnectionContext, client: SiteClient, projectPath: string): Promise<void> {
    const app: StringDictionary = await client.listApplicationSettings();

    const remoteDTSConnection: string | undefined = app?.properties?.[ConnectionKey.DTS];
    const remoteDTSHubName: string | undefined = app?.properties?.[ConnectionKey.DTSHub];

    if (remoteDTSConnection && remoteDTSHubName) {
        return;
    }

    const localDTSConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.DTS, projectPath);
    const localDTSHubName: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.DTSHub, projectPath);
    const availableDeployConnectionTypes = new Set([ConnectionType.Azure]);

    const wizardContext: IDTSAzureConnectionWizardContext = {
        ...context,
        subscription: context.subscription,
        projectPath,
        action: CodeAction.Deploy,
        dtsConnectionType: ConnectionType.Azure,
        dts: remoteDTSConnection ? await getDTSResource(context, nonNullValue(tryGetDTSEndpoint(remoteDTSConnection))) : undefined,
        // If the local settings are using the emulator (i.e. localhost), it's fine because it won't match up with any remote resources and the suggestion will end up hidden from the user
        suggestedDTSEndpointLocalSettings: tryGetDTSEndpoint(localDTSConnection),
        suggestedDTSHubNameLocalSettings: localDTSHubName,
    };

    const wizard: AzureWizard<IDTSAzureConnectionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new DTSConnectionTypeListStep(availableDeployConnectionTypes)],
    });

    await wizard.prompt();
    await wizard.execute();
}

async function getDTSResource(context: ValidateDTSConnectionContext, dtsEndpoint: string): Promise<DurableTaskSchedulerResource | undefined> {
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

    const endpointMatch = dtsConnection.match(/Endpoint=(^;)+/);
    if (!endpointMatch) {
        return undefined;
    }

    return endpointMatch[1];
}
