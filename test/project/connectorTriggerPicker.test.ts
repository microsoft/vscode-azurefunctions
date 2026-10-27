/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
    createConnectorTriggerPickerViewModel,
} from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import {
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

    test('builds a localized picker view model without external icon URLs', () => {
        const viewModel = createConnectorTriggerPickerViewModel();
        const serialized = JSON.stringify(viewModel);

        assert.strictEqual(viewModel.labels.panelTitle, 'Connector Trigger');
        assert.strictEqual(viewModel.labels.title, 'Choose a connector');
        assert.ok(!serialized.includes('https://'));
    });
});
