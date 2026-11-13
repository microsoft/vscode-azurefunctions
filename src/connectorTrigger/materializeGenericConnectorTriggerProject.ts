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
): Promise<void> {
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

    await ensureConnectorTriggerPollProjects(projectPath, language, selection, outputMetadata);
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
    await AzExtFsExtra.writeFile(path.join(projectPath, 'README.md'), `# Connector Trigger functions

This project was created from the pinned language genericApp starter.

${bindings.sort((left, right) => (left.functionName ?? '').localeCompare(right.functionName ?? '')).map(binding => `- Function \`${binding.functionName}\`: connection \`${binding.connectionSettingName}\`, trigger configuration \`${binding.triggerConfigSettingName}\`.`).join('\n')}

Configure each binding's trigger configuration setting and its connection's polling endpoint setting before running locally. Each event needs its own Trigger Config; events can share a Connector Namespace and connection.

Azure resources, connector authorization, and event parameters are not created by this authoring flow.
`);
}
