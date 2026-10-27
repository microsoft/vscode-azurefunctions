/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
    isConnectorTriggerPickerMessage,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import {
    createConnectorTriggerPickerViewModel,
} from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import {
    allowWebviewImageSources,
    escapeWebviewInitialData,
} from '../../src/commands/createNewProject/connectorTriggerPicker/escapeWebviewInitialData';
import {
    getConnectorTriggerIconSources,
    getConnectorTriggerOption,
    getConnectorTriggerOptions,
    getConnectorTriggerTemplateFilters,
} from '../../src/commands/createNewProject/connectorTriggerPicker/connectorTriggerCatalog';

suite('Connector trigger picker', () => {
    test('imports the Connector Namespace connector catalog order', () => {
        const options = getConnectorTriggerOptions();

        assert.strictEqual(options.length, 21);
        assert.deepStrictEqual(options.slice(0, 4).map(option => [option.id, option.label]), [
            ['office365', 'Office 365 Outlook'],
            ['sharepointonline', 'SharePoint'],
            ['onedriveforbusiness', 'OneDrive for Business'],
            ['teams', 'Microsoft Teams'],
        ]);
    });

    test('uses the selected connector label to filter the existing template gallery', () => {
        assert.deepStrictEqual(getConnectorTriggerOption('sharepointonline'), {
            id: 'sharepointonline',
            label: 'SharePoint',
            iconUrl: 'https://preprod.static.powerapps.com/resource/ppcr/releases/v1.0.1814/1.0.1814.4751/sharepointonline/icon.png',
            templateSearch: 'SharePoint',
        });
        assert.strictEqual(getConnectorTriggerOption('unknown'), undefined);
        assert.deepStrictEqual(
            getConnectorTriggerTemplateFilters(
                { language: 'python', useCase: 'connectors', resource: 'connector' },
                'sharepointonline',
            ),
            {
                language: 'python',
                useCase: 'connectors',
                resource: 'connector',
                search: 'SharePoint',
            },
        );
        assert.strictEqual(
            getConnectorTriggerTemplateFilters({}, 'unknown'),
            undefined,
        );
    });

    test('builds the source picker labels and static icon catalog', () => {
        const viewModel = createConnectorTriggerPickerViewModel();

        assert.strictEqual(viewModel.labels.panelTitle, 'Connector Trigger');
        assert.strictEqual(viewModel.labels.title, 'Create New Connection');
        assert.strictEqual(viewModel.labels.connectorGroup, 'Connector');
        assert.ok(viewModel.connectors.every(option => option.iconUrl?.startsWith('https://')));
        assert.deepStrictEqual(getConnectorTriggerIconSources(), [
            'https://preprod.static.powerapps.com',
            'https://conn-afd-test-endpoint-ekb7c2aueydtd3bf.b02.azurefd.net',
        ]);
    });

    test('escapes apostrophes in the shared webview initial-data value', () => {
        const template = "before _initialData: 'don't'\nafter";

        assert.strictEqual(
            escapeWebviewInitialData(template),
            "before _initialData: 'don%27t'\nafter",
        );
        assert.strictEqual(escapeWebviewInitialData('no initial data'), 'no initial data');
        assert.throws(
            () => escapeWebviewInitialData("before _initialData: 'unterminated"),
            /Unable to locate/,
        );
    });

    test('adds only connector catalog image hosts to the webview CSP', () => {
        const template = 'img-src vscode-webview: data: vscode-resource:;';
        const sources = getConnectorTriggerIconSources();

        assert.strictEqual(
            allowWebviewImageSources(template, sources),
            `img-src vscode-webview: data: vscode-resource: ${sources.join(' ')};`,
        );
        assert.strictEqual(
            allowWebviewImageSources(
                `img-src vscode-webview: ${sources[0]};`,
                sources,
            ),
            `img-src vscode-webview: ${sources.join(' ')};`,
        );
    });

    test('accepts only the picker command contract', () => {
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'close' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            connectorId: 'sharepointonline',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            type: 'continue',
            connectorId: 'sharepointonline',
        }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            connectorId: 1,
        }), false);
    });
});
