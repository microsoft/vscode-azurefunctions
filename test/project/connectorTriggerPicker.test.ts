/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { findConnectorProjectTemplates } from '../../src/commands/createNewProject/connectorTriggerPicker/connectorProjectTemplates';
import {
    createConnectorTriggerPickerViewModel,
} from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import {
    allowWebviewImageSources,
    escapeWebviewInitialData,
} from '../../src/commands/createNewProject/connectorTriggerPicker/escapeWebviewInitialData';
import {
    partitionConnectorOptions,
    shouldExpandOtherConnectors,
} from '../../src/webview/connectorTriggerPicker/connectorTriggerGroups';
import {
    isConnectorTriggerPickerMessage,
    isConnectorTriggerPickerResponse,
    type ConnectorTriggerOption,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { ProjectLanguage } from '../../src/constants';
import { type IProjectTemplate, type TemplateCategory } from '../../src/templates/projectTemplates/IProjectTemplate';

suite('Connector trigger picker', () => {
    test('builds localized catalog picker labels', () => {
        const viewModel = createConnectorTriggerPickerViewModel();

        assert.strictEqual(viewModel.labels.panelTitle, 'Template Gallery');
        assert.strictEqual(viewModel.labels.galleryTitle, 'Template Gallery');
        assert.strictEqual(viewModel.labels.connectorPageTitle, 'Choose a connector');
        assert.strictEqual(viewModel.labels.eventPageTitle, 'Choose events');
        assert.strictEqual(
            viewModel.labels.azureContextRequired,
            'Azure sign-in, a subscription, and a region are required before you can browse Connector Triggers.',
        );
        assert.strictEqual(
            viewModel.labels.selectSubscription,
            'Select a subscription',
        );
        assert.strictEqual(
            viewModel.labels.selectRegion,
            'Select a region',
        );
        assert.strictEqual(
            viewModel.labels.recommendedRegions,
            'Recommended',
        );
        assert.strictEqual(
            viewModel.labels.otherRegions,
            'Other',
        );
        assert.strictEqual(
            viewModel.labels.showAllSubscriptions,
            'Show all subscriptions...',
        );
        assert.ok(!('catalogSetupDeferred' in viewModel.labels));
        assert.strictEqual(viewModel.labels.connectorGroup, 'Connector');
        assert.strictEqual(viewModel.labels.featuredConnectors, 'Featured connectors');
        assert.strictEqual(viewModel.labels.otherConnectors, 'Other connectors ({0})');
        assert.strictEqual(
            viewModel.labels.pollingEventDelivery,
            'Polling',
        );
        assert.strictEqual(
            viewModel.labels.webhookEventDelivery,
            'Webhook - creation is not supported yet',
        );
    });

    test('groups featured connectors in the configured order and expands search results', () => {
        const connectors: ConnectorTriggerOption[] = [
            { id: 'salesforce', label: 'Salesforce' },
            { id: 'custom-office-helper', label: 'Office 365 helper' },
            { id: 'dataflows', label: 'Power Query Dataflows' },
            { id: 'teams', label: 'Microsoft Teams' },
            { id: 'OFFICE365', label: 'OFFICE 365 OUTLOOK' },
            { id: 'github', label: 'GitHub' },
            { id: 'sharepointonline', label: 'SharePoint' },
            { id: 'visualstudio-team-services', label: 'Azure DevOps' },
            { id: 'planner', label: 'Planner' },
            { id: 'onedriveforbusiness', label: 'OneDrive for Business' },
            {
                id: 'adobesign',
                label: 'Adobe Acrobat Sign',
            },
            {
                id: 'kusto',
                label: 'Azure Data Explorer',
            },
            {
                id: 'pending',
                label: 'Pending metadata',
            },
        ];

        const groups = partitionConnectorOptions(connectors);

        assert.deepStrictEqual(groups.featured.map(connector => connector.id), [
            'OFFICE365',
            'sharepointonline',
            'onedriveforbusiness',
            'teams',
            'planner',
            'salesforce',
            'visualstudio-team-services',
            'dataflows',
        ]);
        assert.deepStrictEqual(groups.other.map(connector => connector.id), [
            'custom-office-helper',
            'github',
            'adobesign',
            'kusto',
            'pending',
        ]);
        assert.strictEqual(shouldExpandOtherConnectors('', false), false);
        assert.strictEqual(shouldExpandOtherConnectors('', true), true);
        assert.strictEqual(shouldExpandOtherConnectors('github', false), true);
    });

    test('resolves Outlook and SharePoint templates for every supported language', () => {
        const supportedLanguages = [
            [ProjectLanguage.CSharp, 'csharp'],
            [ProjectLanguage.TypeScript, 'typescript'],
            [ProjectLanguage.Python, 'python'],
        ] as const;
        const templates: IProjectTemplate[] = [
            ...supportedLanguages.flatMap(([language, slug]) => [
                createProjectTemplate(
                    `office365-connector-trigger-${slug}`,
                    'Office 365 Outlook Connector Triggers',
                    'connector',
                    language,
                ),
                createProjectTemplate(
                    `sharepoint-connector-trigger-${slug}`,
                    'SharePoint Online Connector Triggers',
                    'connector',
                    language,
                ),
            ]),
            createProjectTemplate('http-python', 'HTTP Trigger', 'http'),
        ];

        for (const [language, slug] of supportedLanguages) {
            const languageTemplates = templates.filter(template =>
                template.languages.includes(language));
            assert.deepStrictEqual(
                findConnectorProjectTemplates(languageTemplates, {
                    id: 'office365',
                    label: 'Office 365 Outlook',
                }).map(template => template.id),
                [`office365-connector-trigger-${slug}`],
            );
            assert.deepStrictEqual(
                findConnectorProjectTemplates(languageTemplates, {
                    id: 'sharepointonline',
                    label: 'SharePoint',
                }).map(template => template.id),
                [`sharepoint-connector-trigger-${slug}`],
            );
        }
        assert.deepStrictEqual(
            findConnectorProjectTemplates(templates, {
                id: 'unknown',
                label: 'Unknown Connector',
            }),
            [],
        );
    });

    test('escapes initial data and allows HTTPS API-provided icons', () => {
        const template = "before _initialData: 'don't'\nafter";

        assert.strictEqual(
            escapeWebviewInitialData(template),
            "before _initialData: 'don%27t'\nafter",
        );
        assert.strictEqual(
            allowWebviewImageSources(
                'img-src vscode-webview: https://*.vscode-cdn.net data:;',
                ['https:'],
            ),
            'img-src vscode-webview: https://*.vscode-cdn.net data: https:;',
        );
        assert.throws(
            () => escapeWebviewInitialData("before _initialData: 'unterminated"),
            /Unable to locate/,
        );
    });

    test('accepts only the picker request and response contracts', () => {
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'initialize' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'signIn' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'browseTemplates' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'openCopilot' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'selectSubscription',
            subscriptionId: 'sub-one',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'selectRegion',
            subscriptionId: 'sub-one',
            region: 'eastus2',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadCatalog',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadAllSubscriptions',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadFilteredSubscriptions',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadConnectorOperations',
            connectorId: 'office365',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'retryConnectorDiscovery',
        }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadOperationInputs',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
        }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'createNamespace' }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            connectorId: 'sharepointonline',
        }), false);

        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'azureContextSelected',
            azureContext: {
                subscriptionId: 'sub-one',
                subscriptionName: 'Subscription One',
                region: 'eastus2',
                regionDisplayName: 'East US 2',
            },
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'azureContextRequired',
            message: 'Azure context is required.',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'subscriptionsLoaded',
            subscriptions: [{ id: 'sub-one', label: 'Subscription One' }],
            showingAll: false,
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'locationsLoaded',
            subscriptionId: 'sub-one',
            locations: [{
                name: 'eastus2',
                label: 'East US 2',
                regionCategory: 'Recommended',
            }, {
                name: 'westcentralus',
                label: 'West Central US',
            }],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'locationsLoaded',
            subscriptionId: 'sub-one',
            locations: [{
                name: 'eastus2',
                label: 'East US 2',
                regionCategory: 1,
            }],
        }), false);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'catalogLoaded',
            connectors: [],
            operations: [],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'connectorDiscoveryProgress',
            classifications: [{
                connectorId: 'office365',
                eventSupport: 'poll',
            }],
            failed: 1,
            inProgress: true,
            processed: 2,
            total: 3,
        }), false);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'connectorOperationsLoaded',
            connectorId: 'office365',
            operations: [],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'connectorOperationsFailed',
            connectorId: 'office365',
            message: 'Failed',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'operationInputsFailed',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
            message: 'Failed',
        }), false);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'projectCreationStarted',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'projectCreationProgress',
            detail: 'Cloning template...',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'projectCreationFailed',
            message: 'No template found.',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'loadFailed',
            scope: 'catalog',
            message: 'Failed',
        }), true);
    });
});

function createProjectTemplate(
    id: string,
    displayName: string,
    resource: string = 'connector',
    language: ProjectLanguage = ProjectLanguage.Python,
): IProjectTemplate {
    const operation = id.startsWith('office365-connector-trigger-') ?
        {
            operationId: 'OnNewEmail',
            functionName: 'OnNewEmail',
            ownedPaths: ['src/functions/onNewEmail.ts'],
        } :
        id.startsWith('sharepoint-connector-trigger-') ?
            {
                operationId: 'OnNewFile',
                functionName: 'OnNewFile',
                ownedPaths: ['src/functions/onNewFile.ts'],
            } :
            undefined;

    return {
        id,
        displayName,
        shortDescription: displayName,
        categories: ['connectors' as TemplateCategory],
        languages: [language],
        repositoryUrl: 'https://example.invalid/template',
        resource,
        connectorTrigger: operation ? { operations: [operation] } : undefined,
    } as IProjectTemplate;
}
