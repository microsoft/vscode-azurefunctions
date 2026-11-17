/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type CancellationToken } from 'vscode';
import { findPollingConnectorBindings } from './connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from './connectorTriggerEventIdentity';
import { type ConnectorTriggerOutputMetadata } from './connectorTriggerOutputSchema';
import { type ConnectorTriggerSelections } from './connectorTriggerSelection';
import { ensureConnectorTriggerPollProjects, readConnectorPollSample, retargetConnectorPollSample, validateConnectorTriggerSelections } from './ensureConnectorTriggerPollProject';

// Only retarget the fresh, staged generic sample, never an existing user project.
export async function materializeGenericConnectorTriggerProject(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelections,
    outputMetadata: ReadonlyMap<string, ConnectorTriggerOutputMetadata> = new Map(),
    cancellationToken?: CancellationToken,
): Promise<(string | undefined)[]> {
    const selections = validateConnectorTriggerSelections(selection);
    if (cancellationToken?.isCancellationRequested) {
        throw new UserCancelledError('connectorProjectCreation');
    }
    const sample = await readConnectorPollSample(projectPath, language);
    const firstPath = await retargetConnectorPollSample(sample, language, selections[0]);
    const handlerPaths = await ensureConnectorTriggerPollProjects(projectPath, language, selection, outputMetadata, cancellationToken, sample);
    handlerPaths[0] = firstPath;

    const bindings = await findPollingConnectorBindings(projectPath);
    const firstName = getConnectorTriggerEventIdentity(selections[0].connectorId, selections[0].operationId).functionName.toLowerCase();
    const firstBinding = bindings.find(binding => binding.functionName?.toLowerCase() === firstName);
    const readmePath = path.join(projectPath, 'README.md');
    if (firstBinding && await AzExtFsExtra.pathExists(readmePath)) {
        let readme = await AzExtFsExtra.readFile(readmePath);
        readme = readme.split(`\`${sample.binding.functionName}\``).join(`\`${firstBinding.functionName}\``)
            .split(sample.binding.triggerConfigSettingName).join(firstBinding.triggerConfigSettingName);
        await AzExtFsExtra.writeFile(readmePath, readme);
    }
    return handlerPaths;
}
