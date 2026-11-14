/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage } from '../constants';
import { localize } from '../localize';
import { findPollingConnectorBindings } from './connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from './connectorTriggerEventIdentity';
import { type ConnectorTriggerOutputMetadata } from './connectorTriggerOutputSchema';
import { type ConnectorTriggerSelections } from './connectorTriggerSelection';
import { ensureConnectorTriggerPollProjects, validateConnectorTriggerSelections } from './ensureConnectorTriggerPollProject';

const genericSampleSettings = [
    'AzureBlobConnection', 'AZUREBLOB_TOKEN', 'Office365Connection', 'OFFICE365_TOKEN',
    'SharepointConnection', 'SHAREPOINT_TOKEN', 'TeamsConnection', 'TEAMS_TOKEN',
];

// Only bootstrap the fresh, staged genericApp download, never an existing user project.
export async function materializeGenericConnectorTriggerProject(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelections,
    outputMetadata: ReadonlyMap<string, ConnectorTriggerOutputMetadata> = new Map(),
): Promise<(string | undefined)[]> {
    const selections = validateConnectorTriggerSelections(selection);
    const identity = getConnectorTriggerEventIdentity(selection.connectorId, selections[0].operationId);
    switch (language) {
        case ProjectLanguage.CSharp: {
            const genericSource = path.join(projectPath, 'GenericFunctions.cs');
            await AzExtFsExtra.deleteResource(genericSource, { recursive: false, useTrash: false });
            break;
        }
        case ProjectLanguage.TypeScript: {
            const functionsPath = path.join(projectPath, 'src', 'functions');
            await AzExtFsExtra.deleteResource(functionsPath, { recursive: true, useTrash: false });
            const packagePath = path.join(projectPath, 'package.json');
            const packageJson = await AzExtFsExtra.readJSON<Record<string, unknown>>(packagePath);
            packageJson.name = identity.packageName;
            await AzExtFsExtra.writeJSON(packagePath, packageJson);
            const lockPath = path.join(projectPath, 'package-lock.json');
            if (await AzExtFsExtra.pathExists(lockPath)) {
                const lock = await AzExtFsExtra.readJSON<{ name?: string; packages?: Record<string, { name?: string }> }>(lockPath);
                lock.name = identity.packageName;
                if (lock.packages?.['']) {
                    lock.packages[''].name = identity.packageName;
                }
                await AzExtFsExtra.writeJSON(lockPath, lock);
            }
            break;
        }
        case ProjectLanguage.Python:
            await AzExtFsExtra.writeFile(path.join(projectPath, 'function_app.py'), 'import azure.functions as func\n\napp = func.FunctionApp()\n');
            break;
        default:
            throw new Error(localize('genericConnectorTriggerLanguageUnsupported', 'The selected language does not support Connector Trigger projects.'));
    }

    const handlerPaths = await ensureConnectorTriggerPollProjects(projectPath, language, selection, outputMetadata);
    const settingsPath = path.join(projectPath, 'local.settings.json');
    if (await AzExtFsExtra.pathExists(settingsPath)) {
        const settings = await AzExtFsExtra.readJSON<{ Values?: Record<string, unknown> }>(settingsPath);
        for (const key of genericSampleSettings) {
            delete settings.Values?.[key];
        }
        await AzExtFsExtra.writeJSON(settingsPath, settings);
    }
    const azureYamlPath = path.join(projectPath, 'azure.yaml');
    if (await AzExtFsExtra.pathExists(azureYamlPath)) {
        const azureYaml = (await AzExtFsExtra.readFile(azureYamlPath)).toString();
        await AzExtFsExtra.writeFile(azureYamlPath, azureYaml.replace(/^name:\s*.+$/m, `name: ${identity.projectName}`));
    }
    const bindings = await findPollingConnectorBindings(projectPath);
    if (bindings.length !== selections.length) {
        throw new Error(localize('genericConnectorTriggerMaterializationInvalid', 'The project did not produce one Poll trigger for each selected event.'));
    }
    const runtimePrerequisite = language === ProjectLanguage.CSharp ?
        localize('connectorReadmeDotnet', 'Install the [.NET SDK](https://dotnet.microsoft.com/download) matching the TargetFramework in the generated .csproj file.') :
        language === ProjectLanguage.TypeScript ?
            localize('connectorReadmeNode', 'Install [Node.js 24 or later](https://learn.microsoft.com/azure/azure-functions/functions-reference-node#supported-versions) and npm.') :
            localize('connectorReadmePython', 'Install a [Python version supported by Azure Functions](https://learn.microsoft.com/azure/azure-functions/functions-reference-python#supported-python-versions) and the generated requirements.txt.');
    const azdPreparation = localize('connectorReadmeAzd', 'Review `azure.yaml` and the starter infrastructure. Before using azd, add an Azure Functions service and compatible Bicep or Terraform infrastructure if they are missing. Until then, use the VS Code deployment commands below.');
    const dependencyPreparation = language === ProjectLanguage.Python ?
        localize('connectorReadmePythonDependencies', 'Project creation installs dependencies only when a Python virtual environment is selected. If you skipped virtual-environment creation, select and activate a Python environment, then run `python -m pip install -r requirements.txt` in the project directory before F5.') :
        language === ProjectLanguage.TypeScript ?
            localize('connectorReadmeTypeScriptDependencies', 'Project creation installs the compatible Connector SDK dependencies, builds the project, and adds Node.js types to `tsconfig.json`.') :
            localize('connectorReadmePreparedDependencies', 'Project creation prepares dependencies.');
    const functions = bindings.sort((left, right) => (left.functionName ?? '').localeCompare(right.functionName ?? '')).map(binding =>
        localize('connectorReadmeBinding', '- Function `{0}`: connection `{1}`, trigger configuration `{2}`.',
            binding.functionName, binding.connectionSettingName, binding.triggerConfigSettingName)).join('\n');
    await AzExtFsExtra.writeFile(path.join(projectPath, 'README.md'), localize('genericConnectorTriggerReadme', `# Connector Trigger functions

This project contains polling Connector Trigger functions for the selected events.

{0}

## Prerequisites

- Install [VS Code](https://code.visualstudio.com/) and the [Azure Functions extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurefunctions).
- {1}
- Install [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local) and start [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) when using development storage.
- Use an Azure subscription with permission to create the required resources, and an account authorized to access the selected connector's service.
- For azd provisioning, install the [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd).
- Sign in through Azure Resources in VS Code. The VS Code provisioning sign-in selects Azure resources but does not guarantee the host's polling identity; verify the host credential and its connection access.

## Provision with VS Code

Creating this project does not create Azure resources, authorize connections, or collect event parameters. For a single polling event, press **F5**, then choose **Configure** when prompted to request Connector Trigger setup.

**Automatic setup is conditional on verifying the Functions host identity.** A standard Functions host task may use the VS Code credential. The broker account, tenant, and cloud must match the selected subscription. This local-only credential selection applies to every default Azure credential chain in the host process; it does not require Azure CLI login or a token file. For an unverified debug task, choosing **Configure** stops with an unverified-identity diagnostic; nothing is created or changed. Existing explicit credentials are not replaced.

The VS Code credential requires Connector Poll and broker support in the local host. F5 does not verify this before starting; if support is missing, the host fails when it starts polling. New script projects use preview extension bundle 4.50.0 or later; a compiled .NET host must include the broker package and native assets in its host-side extension output.

For manual setup, create a Connector Namespace and authenticated connection using the [connection setup guide](https://github.com/Azure/azure-functions-connector-extension/blob/main/.github/skills/connection-setup/SKILL.md), then create an enabled Poll Trigger Config for each event using the [ARM-based Poll registration guide](https://github.com/Azure/azure-functions-connector-extension/blob/main/.github/skills/poll-trigger-registration/SKILL.md). The portal and \`az connector-namespace trigger create\` do not expose the Poll delivery contract.

Grant separate connection-level access policies to the Connector Namespace identity and the local Function/developer identity. Derive the gateway-level polling endpoint from the service-provided \`pollingEndpoints.receiveUri\` as described in the guide. Set it in the connection's \`__pollingEndpoint\` setting, and set the Trigger Config name in the binding's trigger configuration setting in \`local.settings.json\`, then retry F5. Use the binding-specific setting names listed above.

When automatic setup is available, select the subscription, supported region, authored connector, and polling event. Choose an existing or new Connector Namespace and connection. Review the proposed resources and local-settings changes, then choose **Set up and authenticate** and complete browser consent if required.

Select the event parameters after authentication, then choose **Apply and continue**. For RSS, provide a publicly reachable feed URL. Events without inputs finish after setup. Setup writes the service-provided polling endpoint, Trigger Config reference, and any approved local credential selection to \`local.settings.json\`, preserving unrelated settings. Existing values are hidden and conflicting environment overrides or unsaved edits must be resolved before saving.

Each event needs its own Trigger Config; events can share a Connector Namespace and connection. Use a separate Trigger Config for local execution to avoid competing with an Azure listener. For a multi-event project, F5 setup configures each event in turn: choose the event to configure from the **Event trigger to configure** list at the top of the setup screen. If you stop before every event is configured, F5 warns that the remaining events will not run until their trigger configuration and \`__pollingEndpoint\` settings are set.

## Provision with azd

{2}

For the Functions host, azd requires compatible infrastructure as code; it does not generate it from the service declaration. See [Deploy to Azure Functions with azd](https://learn.microsoft.com/azure/developer/azure-developer-cli/function-app-deployments) for infrastructure and service-tag requirements.

After the required project configuration and infrastructure are in place, run from the project directory:

\`\`\`sh
azd auth login
azd up
\`\`\`

\`azd up\` provisions the configured infrastructure and deploys the app. Check whether the starter provisions a Connector Namespace, connections, and Trigger Configs. If not, configure those separately using the Poll registration guide above, or with F5 setup when available for a single local event. Local F5 settings are not automatically copied to Azure by azd.

## Run locally

{3}

Open the project folder in VS Code and press **F5**. Start Azurite if the project uses development storage. For missing or invalid connector settings, choose **Configure** to follow the setup above. **Debug Anyway** starts debugging without configuring the connector; **Cancel** stops debugging. Debug Anyway does not save settings or suppress the next setup prompt.

Already configured projects skip setup. Generate an event in the connected service and verify an invocation in the Functions host output or a breakpoint in the generated handler. RSS can take 30 minutes between polls; a running host alone does not prove event delivery. Stop debugging to stop the local host.

Cancellation after provisioning starts keeps resources already created. Cancel and restart debugging to change locked resource choices. Failed parameter lookups show an error; use **Reload choices** to retry. Keep \`local.settings.json\` and credentials out of source control.

## Deploy

Use **Azure Functions: Create Function App in Azure** followed by **Azure Functions: Deploy to Function App** in VS Code. Alternatively, after completing the azd project configuration and infrastructure preparation above, run \`azd up\`. For subsequent deployments to those provisioned resources, run \`azd deploy\`.

Create an enabled Poll Trigger Config for each event using the ARM-based Poll registration guide above. In the deployed Function App's application settings, set each binding's Trigger Config setting to its Trigger Config name and each connection's \`__pollingEndpoint\` setting to the gateway-level endpoint derived from \`pollingEndpoints.receiveUri\`. When you deploy from VS Code, these Trigger Config and \`__pollingEndpoint\` settings are uploaded from \`local.settings.json\`, other missing non-local settings are added, and local-only storage and credential settings are skipped.

Configure the Function App to use its managed identity for the connection (for example, \`<Connection>__credential=managedidentity\`). Grant separate connection-level access policies to the Connector Namespace identity and the Function App identity. VS Code deployment sets the credential setting and grants the Function App identity's access policy for matching Trigger Configs. Ensure the Function App also has \`AzureWebJobsStorage\` and \`APPLICATIONINSIGHTS_CONNECTION_STRING\` settings. The Functions host connects outbound to poll; no public callback is required.

Verify that the connection is **Connected**, the trigger is **Enabled**, and an event reaches the deployed function in the Function App logs.
`, functions, runtimePrerequisite, azdPreparation, dependencyPreparation));
    return handlerPaths;
}
