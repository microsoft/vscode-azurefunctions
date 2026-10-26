/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
    createPollingConnectorTriggerDetailsViewModel,
    isConnectorTriggerTemplate,
} from '../../src/commands/createNewProject/connectorTriggerDetails/createConnectorTriggerDetailsViewModel';
import { type ProjectLanguage } from '../../src/constants';
import { type IProjectTemplate, type TemplateCategory } from '../../src/templates/projectTemplates/IProjectTemplate';

suite('Connector trigger details', () => {
    const connectorTemplate: IProjectTemplate = {
        id: 'office365-connector-trigger-python',
        displayName: 'Office 365 Outlook Connector Triggers',
        shortDescription: 'Office 365 email and calendar connector triggers',
        longDescription: 'Receive Office 365 email and calendar events with connector triggers.',
        bindingType: 'trigger',
        resource: 'connector',
        categories: ['event-processing' as TemplateCategory],
        languages: ['Python' as ProjectLanguage],
        repositoryUrl: 'https://example.invalid/private?token=must-not-be-rendered',
    };

    test('recognizes connector trigger templates without matching unrelated templates', () => {
        assert.strictEqual(isConnectorTriggerTemplate(connectorTemplate), true);
        assert.strictEqual(isConnectorTriggerTemplate({ resource: 'CONNECTOR', bindingType: 'TRIGGER' }), true);
        assert.strictEqual(isConnectorTriggerTemplate({ resource: 'connector', bindingType: undefined }), true);
        assert.strictEqual(isConnectorTriggerTemplate({ resource: 'http', bindingType: 'trigger' }), false);
        assert.strictEqual(isConnectorTriggerTemplate({ resource: 'connector', bindingType: 'output' }), false);
    });

    test('builds the polling detail experience from available template metadata', () => {
        const viewModel = createPollingConnectorTriggerDetailsViewModel(connectorTemplate);

        assert.strictEqual(viewModel.templateId, connectorTemplate.id);
        assert.strictEqual(viewModel.title, connectorTemplate.displayName);
        assert.strictEqual(viewModel.description, connectorTemplate.longDescription);
        assert.strictEqual(viewModel.overview.name.text, connectorTemplate.displayName);
        assert.strictEqual(viewModel.overview.description.text, connectorTemplate.shortDescription);
        assert.strictEqual(viewModel.delivery.mode.text, 'Poll');
        assert.strictEqual(viewModel.delivery.mode.tone, 'success');
        assert.deepStrictEqual(viewModel.configuration.triggerParameters, []);
        assert.deepStrictEqual(viewModel.messageHistory, []);
    });

    test('keeps unavailable Azure state explicit and does not flow repository data into the view', () => {
        const viewModel = createPollingConnectorTriggerDetailsViewModel(connectorTemplate);
        const serialized = JSON.stringify(viewModel);

        assert.strictEqual(viewModel.overview.location.text, 'Not configured');
        assert.strictEqual(viewModel.configuration.connection.text, 'Not configured');
        assert.strictEqual(viewModel.configuration.authenticatedUser.text, 'Not configured');
        assert.strictEqual(viewModel.configuration.event.text, 'Not selected');
        assert.strictEqual(viewModel.pollingEndpoint.baseUrl.copyValue, undefined);
        assert.strictEqual(viewModel.pollingEndpoint.triggerConfigurationName.copyValue, undefined);
        assert.strictEqual(viewModel.delivery.latestPoll.text, 'Not available yet');
        assert.strictEqual(viewModel.delivery.pendingMessages.text, 'Not available yet');
        assert.ok(!serialized.includes('must-not-be-rendered'));
    });

    test('falls back to the short description when no long description is available', () => {
        const viewModel = createPollingConnectorTriggerDetailsViewModel({
            ...connectorTemplate,
            longDescription: undefined,
        });

        assert.strictEqual(viewModel.description, connectorTemplate.shortDescription);
    });
});
