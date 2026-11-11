/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    getConnectorGalleryLaunchOptions,
    getConnectorGalleryTab,
    getConnectorTriggerLanguage,
    isConnectorGalleryTabMessage,
    type ExternalTabSelectedMessage,
} from '../../src/commands/createNewProject/connectorGalleryTab';
import { connectorGallery, ProjectLanguage } from '../../src/constants';

suite('Connector Gallery tab', () => {
    const projectPath = vscode.Uri.file('/connector-project').fsPath;

    test('declares a Connectors tab that owns the connectors use-case pill', () => {
        assert.deepStrictEqual(getConnectorGalleryTab(), {
            id: connectorGallery.id,
            label: 'Connectors',
            icon: 'plug',
            useCases: [connectorGallery.useCase],
        });
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

    test('connectors pill reuses the gallery language and location without prompting', async () => {
        const context = await createTestActionContext();
        const message: ExternalTabSelectedMessage = {
            type: 'externalTabSelected',
            tabId: connectorGallery.id,
            source: 'filter',
            filters: { language: 'dotnet', useCase: connectorGallery.useCase, resource: 'all', search: '' },
        };

        const options = await context.ui.runWithInputs([], async () =>
            await getConnectorGalleryLaunchOptions(context, message, projectPath));

        assert.deepStrictEqual(options, {
            language: ProjectLanguage.CSharp,
            initialLocation: projectPath,
            initialFilters: { language: 'dotnet', useCase: connectorGallery.useCase, resource: connectorGallery.resource },
        });
        assert.strictEqual(context.telemetry.properties.flow, connectorGallery.telemetryFlow);
        assert.strictEqual(context.telemetry.properties.connectorTabSource, 'filter');
    });

    test('Connectors tab prompts for an unsupported language and missing location', async () => {
        const context = await createTestActionContext();
        const message: ExternalTabSelectedMessage = {
            type: 'externalTabSelected',
            tabId: connectorGallery.id,
            source: 'tab',
            filters: { language: 'all', useCase: 'all', resource: 'all', search: '' },
        };

        const options = await context.ui.runWithInputs(['Python', projectPath], async () =>
            await getConnectorGalleryLaunchOptions(context, message, undefined));

        assert.strictEqual(options.language, ProjectLanguage.Python);
        assert.strictEqual(options.initialLocation, projectPath);
        assert.strictEqual(options.initialFilters.language, 'python');
        assert.strictEqual(context.telemetry.properties.languageFromFilter, 'false');
    });
});
