/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { type FilterState } from '@microsoft/vscode-azext-webview';
import { connectorGallery, ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { type ConnectorTriggerPickerLaunchOptions } from './connectorTriggerPicker/ConnectorTriggerPickerController';

/**
 * Gallery tab that hands off to the Connector Trigger webview. Shared with
 * `@microsoft/vscode-azext-webview` through `TemplateGalleryConfig.externalTabs`.
 */
export interface ConnectorGalleryExternalTab {
    id: string;
    label: string;
    icon?: string;
    useCases?: string[];
}

export type ConnectorGalleryTabSource = 'tab' | 'filter';

export interface ExternalTabSelectedMessage {
    type: 'externalTabSelected';
    tabId: string;
    source: ConnectorGalleryTabSource;
    filters?: Partial<FilterState>;
}

const connectorTriggerLanguages: ReadonlyMap<string, ProjectLanguage> = new Map([
    ['dotnet', ProjectLanguage.CSharp],
    ['typescript', ProjectLanguage.TypeScript],
    ['python', ProjectLanguage.Python],
]);

export function getConnectorGalleryTab(): ConnectorGalleryExternalTab {
    return {
        id: connectorGallery.id,
        label: localize('connectorsTab', 'Connectors'),
        icon: 'plug',
        useCases: [connectorGallery.useCase],
    };
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

    let language = getConnectorTriggerLanguage(message.filters?.language);
    context.telemetry.properties.languageFromFilter = String(!!language);
    if (!language) {
        const picks: IAzureQuickPickItem<ProjectLanguage>[] = [...connectorTriggerLanguages.values()].map(value => ({
            label: value === ProjectLanguage.CSharp ? 'C#' : value,
            data: value,
        }));
        language = (await context.ui.showQuickPick(picks, {
            placeHolder: localize('selectConnectorTriggerLanguage', 'Select a language for your Connector Trigger project'),
            stepName: 'connectorTriggerLanguage',
        })).data;
    }
    context.telemetry.properties.projectLanguage = language;

    if (!initialLocation) {
        const folders = await context.ui.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: localize('selectConnectorProjectFolder', 'Select Folder'),
            title: localize('selectConnectorProjectFolderTitle', 'Select a folder for your Connector Trigger project'),
            stepName: 'connectorTriggerProjectFolder',
        });
        initialLocation = folders[0].fsPath;
    }

    return {
        isProjectWizard: true,
        language,
        initialLocation,
        initialFilters: {
            language: getGalleryLanguageFilter(language),
            useCase: connectorGallery.useCase,
            resource: connectorGallery.resource,
        },
    };
}
