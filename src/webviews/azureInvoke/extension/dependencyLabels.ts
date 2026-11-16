/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../localize';
import { type DependencyLabels } from '../shared/httpRequest';

export function getDependencyLabels(): DependencyLabels {
    return {
        title: localize('azureInvoke.dependencies', 'Dependencies'),
        prerequisites: localize('azureInvoke.prerequisites', 'Prerequisite requests'),
        values: localize('azureInvoke.linkedValues', 'Linked values'),
        name: localize('azureInvoke.variableName', 'Variable'),
        source: localize('azureInvoke.sourceRequest', 'Source request'),
        pointer: localize('azureInvoke.valueSelector', 'Request or response selector'),
        selectSource: localize('azureInvoke.selectSource', 'Select a request'),
        search: localize('azureInvoke.searchRequests', 'Search requests...'),
        noResults: localize('azureInvoke.noMatchingRequests', 'No matching requests'),
        unavailable: localize('azureInvoke.unavailableSource', 'Unavailable request'),
        add: localize('azureInvoke.addLinkedValue', 'Add linked value'),
        remove: localize('azureInvoke.removeLinkedValue', 'Remove linked value'),
        hint: localize('azureInvoke.dependenciesHint', 'Search for a prerequisite or link a value using /body/id, /headers/location, /status, or /request/body/email. Use {{accountId}} in request values. Quoted JSON placeholders keep their JSON type. {{guid}} generates one UUID per request run. Link /request/body fields to reuse generated credentials in later requests. Send reuses successful results; Run chain reruns prerequisites and can change data.'),
        runChain: localize('azureInvoke.runChain', 'Run chain'),
    };
}
