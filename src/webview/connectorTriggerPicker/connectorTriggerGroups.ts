/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ConnectorTriggerOption } from './ConnectorTriggerPickerViewModel';

const featuredConnectorIdentities = [
    ['office365', 'office365outlook'],
    ['sharepointonline', 'sharepoint'],
    ['onedriveforbusiness'],
    ['teams', 'microsoftteams'],
    ['planner'],
    ['salesforce'],
    ['visualstudioteamservices', 'azuredevops', 'vsts'],
    ['dataflows', 'powerquerydataflows'],
] as const;

export function partitionConnectorOptions(
    options: readonly ConnectorTriggerOption[],
): {
    featured: ConnectorTriggerOption[];
    other: ConnectorTriggerOption[];
} {
    const remaining = new Map(
        options.map(option => [normalizeConnectorIdentity(option.id), option]),
    );
    const featured: ConnectorTriggerOption[] = [];
    for (const identities of featuredConnectorIdentities) {
        const match = identities
            .map(identity => remaining.get(identity))
            .find((option): option is ConnectorTriggerOption => !!option);
        if (match) {
            featured.push(match);
            remaining.delete(normalizeConnectorIdentity(match.id));
        }
    }

    return {
        featured,
        other: options.filter(option =>
            remaining.has(normalizeConnectorIdentity(option.id))),
    };
}

export function shouldExpandOtherConnectors(
    search: string,
    expanded: boolean,
): boolean {
    return expanded || !!search.trim();
}

function normalizeConnectorIdentity(value: string): string {
    return value.toLowerCase().replace(/[^a-z\d]/g, '');
}
