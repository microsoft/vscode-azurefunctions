/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import { type IProjectTemplate } from '@microsoft/vscode-azext-webview';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { createApplyFilters } from '../../node_modules/@microsoft/vscode-azext-webview/dist/esm/src/webview/TemplateGallery/applyFilters';
import {
    getConnectorGalleryLaunchOptions,
    getConnectorGalleryTab,
    getConnectorTriggerLanguage,
    isConnectorGalleryTabMessage,
    promptForConnectorProjectFolder,
    removeConnectorGalleryFilters,
    type ExternalTabSelectedMessage,
} from '../../src/commands/createNewProject/connectorGalleryTab';
import { connectorGallery, ProjectLanguage } from '../../src/constants';
import { createConnectorTriggerPickerViewModel } from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import { getInitialConnectorLanguage } from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerView';

suite('Connector Gallery tab', () => {
    const projectPath = vscode.Uri.file('/connector-project').fsPath;

    test('declares a Connectors tab without taking over a use-case filter', () => {
        assert.deepStrictEqual(getConnectorGalleryTab(), {
            id: connectorGallery.id,
            label: 'Connectors',
            icon: 'plug',
        });
    });

    test('removes only the connectors use case and resource from gallery templates', () => {
        const applyFilters = createApplyFilters({ Python: 'python' }, { Python: 'Python' });
        const base: IProjectTemplate = {
            id: 'base', displayName: 'Template', shortDescription: '', repositoryUrl: 'https://github.com/Azure-Samples/test',
            languages: ['Python'],
        };
        const connector: IProjectTemplate = { ...base, id: 'connector', categories: ['starters', 'Connectors', 'event-processing'], resource: 'Connector' };
        const connectorResourceOnly: IProjectTemplate = { ...base, id: 'connectorResourceOnly', resource: 'connector' };
        const http: IProjectTemplate = { ...base, id: 'http', categories: ['web-apis'], resource: 'http' };
        const uncategorized: IProjectTemplate = { ...base, id: 'uncategorized' };

        const galleryTemplates = removeConnectorGalleryFilters([connector, connectorResourceOnly, http, uncategorized]);

        const { resource: _connectorResource, ...connectorWithoutResource } = connector;
        const { resource: _resourceOnly, ...resourceOnlyWithoutResource } = connectorResourceOnly;
        assert.deepStrictEqual(galleryTemplates, [
            { ...connectorWithoutResource, categories: ['starters', 'event-processing'] },
            resourceOnlyWithoutResource,
            http,
            uncategorized,
        ]);
        assert.deepStrictEqual(connector.categories, ['starters', 'Connectors', 'event-processing']);
        assert.strictEqual(connector.resource, 'Connector');
        const filters = { language: 'all', useCase: 'all', resource: 'all', search: '' };
        assert.deepStrictEqual(applyFilters(galleryTemplates, filters).map(t => t.id), ['connector', 'connectorResourceOnly', 'http', 'uncategorized']);
        assert.deepStrictEqual(applyFilters(galleryTemplates, { ...filters, useCase: connectorGallery.templateCategory }), []);
        assert.deepStrictEqual(applyFilters(galleryTemplates, { ...filters, resource: connectorGallery.resource }), []);
        assert.deepStrictEqual(applyFilters(galleryTemplates, { ...filters, useCase: 'starters' }).map(t => t.id), ['connector']);
        assert.deepStrictEqual(applyFilters(galleryTemplates, { ...filters, resource: 'http' }).map(t => t.id), ['http']);
    });

    test('only accepts Connector tab selection messages', () => {
        assert.ok(isConnectorGalleryTabMessage({ type: 'externalTabSelected', tabId: connectorGallery.id, source: 'tab' }));
        assert.ok(isConnectorGalleryTabMessage({ type: 'externalTabSelected', tabId: connectorGallery.id, source: 'filter' }));
        assert.ok(!isConnectorGalleryTabMessage({ type: 'externalTabSelected', tabId: 'other', source: 'tab' }));
        assert.ok(!isConnectorGalleryTabMessage({ type: 'externalTabSelected', tabId: connectorGallery.id, source: 'menu' }));
        assert.ok(!isConnectorGalleryTabMessage({ type: 'getTemplates' }));
        assert.ok(!isConnectorGalleryTabMessage(undefined));
    });

    test('maps only Connector Trigger languages from gallery filters', () => {
        assert.strictEqual(getConnectorTriggerLanguage('dotnet'), ProjectLanguage.CSharp);
        assert.strictEqual(getConnectorTriggerLanguage('Python'), ProjectLanguage.Python);
        assert.strictEqual(getConnectorTriggerLanguage('typescript'), ProjectLanguage.TypeScript);
        assert.strictEqual(getConnectorTriggerLanguage('javascript'), undefined);
        assert.strictEqual(getConnectorTriggerLanguage('all'), undefined);
        assert.strictEqual(getConnectorTriggerLanguage(undefined), undefined);
    });

    test('Connectors tab reuses the gallery language and location without prompting', async () => {
        const context = await createTestActionContext();
        const message: ExternalTabSelectedMessage = {
            type: 'externalTabSelected',
            tabId: connectorGallery.id,
            source: 'tab',
            filters: { language: 'dotnet', useCase: 'all', resource: 'all', search: '' },
        };

        const options = await context.ui.runWithInputs([], async () =>
            getConnectorGalleryLaunchOptions(context, message, projectPath));

        assert.deepStrictEqual(options, {
            language: ProjectLanguage.CSharp,
            initialLocation: projectPath,
            initialFilters: { language: 'dotnet' },
        });
        assert.strictEqual(context.telemetry.properties.flow, connectorGallery.telemetryFlow);
        assert.strictEqual(context.telemetry.properties.connectorTabSource, 'tab');
    });

    for (const filterLanguage of ['dotnet', 'typescript', 'python']) {
        test(`preselects ${filterLanguage} in the Connector Triggers Language dropdown`, async () => {
            const context = await createTestActionContext();
            const message: ExternalTabSelectedMessage = {
                type: 'externalTabSelected',
                tabId: connectorGallery.id,
                source: 'tab',
                filters: { language: filterLanguage, useCase: 'all', resource: 'all', search: '' },
            };

            const options = await context.ui.runWithInputs([], async () =>
                await getConnectorGalleryLaunchOptions(context, message, projectPath));
            const viewModel = createConnectorTriggerPickerViewModel(options.initialFilters.language);

            assert.strictEqual(getInitialConnectorLanguage(viewModel.language), filterLanguage);
        });
    }

    for (const language of ['all', 'javascript', undefined]) {
        test(`opens the Connectors tab without a language prompt for ${language ?? 'no filter'}`, async () => {
            const context = await createTestActionContext();
            const message: ExternalTabSelectedMessage = {
                type: 'externalTabSelected',
                tabId: connectorGallery.id,
                source: 'tab',
                filters: { language, useCase: 'all', resource: 'all', search: '' },
            };

            const options = await context.ui.runWithInputs([], async () =>
                getConnectorGalleryLaunchOptions(context, message, projectPath));

            assert.strictEqual(options.language, undefined);
            assert.strictEqual(options.initialLocation, projectPath);
            assert.strictEqual(options.initialFilters.language, undefined);
            assert.strictEqual(context.telemetry.properties.languageFromFilter, 'false');
        });
    }

    test('leaves a missing location for the picker field without prompting', async () => {
        const context = await createTestActionContext();
        const message: ExternalTabSelectedMessage = {
            type: 'externalTabSelected',
            tabId: connectorGallery.id,
            source: 'tab',
        };

        const options = await context.ui.runWithInputs([], async () =>
            await getConnectorGalleryLaunchOptions(context, message, undefined));

        assert.strictEqual(options.language, undefined);
        assert.strictEqual(options.initialLocation, undefined);
    });

    test('Browse for the project location defaults the folder dialog to the given folder', async () => {
        const context = await createTestActionContext();
        const workspacePath = vscode.Uri.file('/existing-workspace').fsPath;
        const showOpenDialog = context.ui.showOpenDialog.bind(context.ui);
        let defaultUri: vscode.Uri | undefined;
        context.ui.showOpenDialog = async options => {
            defaultUri = options.defaultUri;
            return await showOpenDialog(options);
        };

        const location = await context.ui.runWithInputs([projectPath], async () =>
            await promptForConnectorProjectFolder(context, workspacePath));

        assert.strictEqual(location, projectPath);
        assert.strictEqual(defaultUri?.fsPath, workspacePath);
    });
});
