/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type ExternalTabSelectionSource, type FilterState, type IProjectTemplate, type TemplateGalleryExternalTab } from '@microsoft/vscode-azext-webview';
import { connectorGallery, ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { type ConnectorTriggerPickerLaunchOptions } from './connectorTriggerPicker/ConnectorTriggerPickerController';

export interface ExternalTabSelectedMessage {
    type: 'externalTabSelected';
    tabId: string;
    source: ExternalTabSelectionSource;
    filters?: Partial<FilterState>;
}

const connectorTriggerLanguages: ReadonlyMap<string, ProjectLanguage> = new Map([
    ['dotnet', ProjectLanguage.CSharp],
    ['typescript', ProjectLanguage.TypeScript],
    ['python', ProjectLanguage.Python],
]);

export function getConnectorGalleryTab(): TemplateGalleryExternalTab {
    return {
        id: connectorGallery.id,
        label: localize('connectorsTab', 'Connectors'),
        icon: 'plug',
    };
}

/**
 * Hides the connector Use Case and Resource filter chips so the Connectors tab is the only connector entry point.
 * Connector templates remain listed when no filter is applied.
 */
export function removeConnectorGalleryFilters(templates: IProjectTemplate[]): IProjectTemplate[] {
    const isConnectorCategory = (category: string) => category.toLowerCase() === connectorGallery.templateCategory;
    return templates.map(template => {
        const hasConnectorCategory = !!template.categories?.some(isConnectorCategory);
        const hasConnectorResource = template.resource?.toLowerCase() === connectorGallery.resource;
        if (!hasConnectorCategory && !hasConnectorResource) {
            return template;
        }

        const { resource, ...rest } = template;
        return {
            ...rest,
            ...(hasConnectorResource ? {} : { resource }),
            ...(template.categories ? { categories: template.categories.filter(category => !isConnectorCategory(category)) } : {}),
        };
    });
}

export function isConnectorGalleryTabMessage(message: unknown): message is ExternalTabSelectedMessage {
    if (typeof message !== 'object' || message === null) {
        return false;
    }
    const candidate = message as Partial<ExternalTabSelectedMessage>;
    return candidate.type === 'externalTabSelected' &&
        candidate.tabId === connectorGallery.id &&
        (candidate.source === 'tab' || candidate.source === 'filter');
}

/** Maps a gallery language filter key to a language supported by Connector Trigger projects. */
export function getConnectorTriggerLanguage(filterLanguage: string | undefined): ProjectLanguage | undefined {
    return filterLanguage ? connectorTriggerLanguages.get(filterLanguage.toLowerCase()) : undefined;
}

export function getGalleryLanguageFilter(language: ProjectLanguage): string {
    return language === ProjectLanguage.CSharp ? 'dotnet' : language.toLowerCase();
}


export async function getConnectorGalleryLaunchOptions(
    context: IActionContext,
    message: ExternalTabSelectedMessage,
    initialLocation: string | undefined,
): Promise<ConnectorTriggerPickerLaunchOptions> {
    context.telemetry.properties.flow = connectorGallery.telemetryFlow;
    context.telemetry.properties.connectorTabSource = message.source;

    const language = getConnectorTriggerLanguage(message.filters?.language);
    context.telemetry.properties.languageFromFilter = String(!!language);
    if (language) {
        context.telemetry.properties.projectLanguage = language;
    }

    return {
        language,
        initialLocation,
        initialFilters: {
            language: language ? getGalleryLanguageFilter(language) : undefined,
        },
    };
}
