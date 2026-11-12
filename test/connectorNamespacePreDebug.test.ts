/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isValidConnectorPollingEndpoint } from '../src/debug/connectorNamespace/connectorTriggerF5Setup';
import { isValidTriggerConfigReference } from '../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';

suite('Connector Namespace pre-debug validation', () => {
    test('accepts supported runtime endpoint shapes and rejects placeholders and ARM resource URLs', () => {
        assert.strictEqual(isValidConnectorPollingEndpoint('https://example.logic.azure.com/api/connectorGateways/id'), true);
        assert.strictEqual(isValidConnectorPollingEndpoint('https://example.logic.azure.com/'), true);
        assert.strictEqual(isValidConnectorPollingEndpoint('https://management.azure.com/subscriptions/sub/connectorGateways/id'), false);
        assert.strictEqual(isValidConnectorPollingEndpoint('https://<connector-namespace-host>'), false);
        assert.strictEqual(isValidConnectorPollingEndpoint('connector-namespace-host'), false);
        assert.strictEqual(isValidConnectorPollingEndpoint(''), false);
        assert.strictEqual(isValidConnectorPollingEndpoint(undefined), false);
    });

    test('validates Trigger Config references', () => {
        assert.strictEqual(isValidTriggerConfigReference('on-new-email-config'), true);
        assert.strictEqual(isValidTriggerConfigReference('/subscriptions/sub/triggerConfigs/config'), true);
        assert.strictEqual(isValidTriggerConfigReference('<trigger-config-name>'), false);
        assert.strictEqual(isValidTriggerConfigReference(''), false);
        assert.strictEqual(isValidTriggerConfigReference(undefined), false);
    });
});
