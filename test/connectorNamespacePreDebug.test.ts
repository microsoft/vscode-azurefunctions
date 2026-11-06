/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getPollingConnectorConnectionPrefixes, getPollingConnectorConnectionPrefixesFromFunctionJson, isValidPollingEndpoint } from '../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';

suite('Connector Namespace pre-debug validation', () => {
    test('detects C# polling connector trigger connection', () => {
        const content = `
            [ConnectorTrigger(
                DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
                Connection = "ConnectorNamespace",
                TriggerConfigName = "%OnNewEmailTriggerConfigName%")]
            string payload`;

        assert.deepStrictEqual(getPollingConnectorConnectionPrefixes(content), ['ConnectorNamespace']);
    });

    test('ignores C# webhook connector trigger', () => {
        assert.deepStrictEqual(
            getPollingConnectorConnectionPrefixes('[ConnectorTrigger] string payload'),
            [],
        );
    });

    test('detects Python polling connector trigger connection', () => {
        const content = `
            @app.connector_trigger(
                arg_name="payloads",
                delivery_mode=func.DeliveryMode.POLL,
                connection="CustomNamespace")
            def run(payloads):`;

        assert.deepStrictEqual(getPollingConnectorConnectionPrefixes(content), ['CustomNamespace']);
    });

    test('detects TypeScript polling connector trigger connection', () => {
        const content = `
            app.connectorTrigger('OnNewEmailPoll', {
                deliveryMode: 'Poll',
                connection: 'ConnectorNamespace',
                triggerConfigName: '%OnNewEmailTriggerConfigName%',
                handler: async () => {}
            });`;

        assert.deepStrictEqual(getPollingConnectorConnectionPrefixes(content), ['ConnectorNamespace']);
    });

    test('ignores TypeScript webhook connector trigger', () => {
        const content = `
            app.connectorTrigger('OnNewEmail', {
                handler: async () => {}
            });`;

        assert.deepStrictEqual(getPollingConnectorConnectionPrefixes(content), []);
    });

    test('detects polling connector trigger in function.json', () => {
        const data = {
            bindings: [
                { type: 'connectorTrigger', deliveryMode: 'Poll', connection: 'ConnectorNamespace' },
                { type: 'connectorTrigger', deliveryMode: 'Webhook' },
                { type: 'httpTrigger', direction: 'in' },
            ],
        };

        assert.deepStrictEqual(getPollingConnectorConnectionPrefixesFromFunctionJson(data), ['ConnectorNamespace']);
    });

    test('validates polling endpoint values', () => {
        assert.equal(isValidPollingEndpoint('https://example.logic.azure.com/api/connectorGateways/id'), true);
        assert.equal(isValidPollingEndpoint('http://localhost:7071/api/connectorGateways/id'), true);
        assert.equal(isValidPollingEndpoint('https://<connector-namespace-host>'), false);
        assert.equal(isValidPollingEndpoint('connector-namespace-host'), false);
        assert.equal(isValidPollingEndpoint(''), false);
        assert.equal(isValidPollingEndpoint(undefined), false);
    });
});
