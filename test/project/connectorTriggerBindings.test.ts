/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
    getConnectorTriggerRegistrations,
    getPollingConnectorBindings,
} from '../../src/connectorTrigger/connectorTriggerBindings';

suite('Connector trigger binding discovery', () => {
    const expected = [{
        connectionSettingName: 'ConnectorConnection',
        functionName: 'OnChangedV3',
        triggerConfigSettingName: 'ConnectorConfig',
    }];

    test('bounds C# attributes to their owning method', () => {
        const source = `
            [Function("Http")]
            public void Http([HttpTrigger] object request) {}
            [Function("ExpressionHttp")]
            public void ExpressionHttp([HttpTrigger] object request) => Respond();
            [Function("OnChangedV3")]
            public void Connector([ConnectorTrigger(
                Connection = "ConnectorConnection",
                TriggerConfigName = "%ConnectorConfig%",
                DeliveryMode = ConnectorDeliveryMode.Poll)] object input) {}
        `;
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source), ['OnChangedV3']);
        assert.deepStrictEqual(getPollingConnectorBindings(source), expected);
    });

    test('bounds Python decorators to their owning function in either decorator order', () => {
        for (const decorators of [
            `@app.function_name(name="OnChangedV3")
@app.connector_trigger(connection="ConnectorConnection", trigger_config_name="%ConnectorConfig%", delivery_mode=DeliveryMode.POLL)`,
            `@app.connector_trigger(connection="ConnectorConnection", trigger_config_name="%ConnectorConfig%", delivery_mode=DeliveryMode.POLL)
@app.function_name(name="OnChangedV3")`,
        ]) {
            const source = `
@app.function_name(name="Http")
@app.route(route="http")
def http(req):
    return "http"

${decorators}
async def connector(event):
    pass
`;
            assert.deepStrictEqual(getConnectorTriggerRegistrations(source), ['OnChangedV3']);
            assert.deepStrictEqual(getPollingConnectorBindings(source), expected);
        }
    });

    test('reads complete inline options regardless of handler position and ignores nested settings', () => {
        const source = `
            app.connectorTrigger("OnChangedV3", {
                handler: async () => {
                    const nested = { connection: "Wrong", triggerConfigName: "%Wrong%", deliveryMode: "Webhook" };
                    return "}, handler: {";
                },
                // Nested handler settings must not override these properties.
                connection: /* binding */ "ConnectorConnection",
                triggerConfigName: "%ConnectorConfig%",
                deliveryMode: "Poll",
            });
            connectors.office365.onChanged("NotPolling", {
                handler: () => ({ deliveryMode: "Poll", connection: "Wrong", triggerConfigName: "%Wrong%" }),
                deliveryMode: "Webhook",
            });
        `;
        assert.deepStrictEqual(getPollingConnectorBindings(source), expected);
    });

    test('keeps named initializers bounded and reads settings after handlers', () => {
        const source = `
            const unrelated = {};
            const webhook = { deliveryMode: "Webhook" };
            const options = {
                handler: () => ({ nested: { value: "}" } }),
                "deliveryMode": "Poll",
                connection: "ConnectorConnection",
                triggerConfigName: "%ConnectorConfig%",
            };
            app.connectorTrigger("Wrong", unrelated);
            app.connectorTrigger("Webhook", webhook);
            app.connectorTrigger("OnChangedV3", options);
        `;
        assert.deepStrictEqual(getPollingConnectorBindings(source), expected);
    });

    test('preserves distinct versioned registration names and Poll candidates', () => {
        const source = ['OnChangedV2', 'OnChangedV3'].map(name =>
            `app.connectorTrigger("${name}", {
                connection: "ConnectorConnection",
                triggerConfigName: "%ConnectorConfig%",
                deliveryMode: "Poll",
                handler: () => {},
            });`).join('\n');
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source), ['OnChangedV2', 'OnChangedV3']);
        assert.deepStrictEqual(
            getPollingConnectorBindings(source).map(candidate => candidate.functionName),
            ['OnChangedV2', 'OnChangedV3'],
        );
    });
});
