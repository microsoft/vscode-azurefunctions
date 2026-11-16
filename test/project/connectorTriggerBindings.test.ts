/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    filterEnabledConnectorBindings,
    findConnectorTriggerRegistrations,
    findPollingConnectorBindings,
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

    test('reads TypeScript DeliveryMode enum values', () => {
        const source = `
            app.connectorTrigger("OnChangedV3", {
                deliveryMode: DeliveryMode.Poll,
                connection: "ConnectorConnection",
                triggerConfigName: "%ConnectorConfig%",
                handler: async () => {},
            });
            app.connectorTrigger("NotPolling", {
                deliveryMode: func.DeliveryMode.Webhook,
                connection: "Wrong",
                triggerConfigName: "%Wrong%",
                handler: async () => {},
            });
        `;
        assert.deepStrictEqual(getPollingConnectorBindings(source), expected);
    });

    test('expands TypeScript for...of loops that register Poll triggers by name', () => {
        const options = `{
                deliveryMode: DeliveryMode.Poll,
                connection: 'ConnectorNamespace',
                triggerConfigName: \`%\${name}TriggerConfigName%\`,
                handler: async (context, invocationContext) => invocationContext.log(\`\${name} received\`),
            }`;
        const source = `
            for (const [name, register] of [
                ['OnChangedPoll', connectors.sharepoint.onChangedItems],
                // ['OnCommentedPoll', connectors.sharepoint.onCommented],
                ['OnNewPoll', connectors.sharepoint.onNewItems],
            ] as const) {
                register(name, ${options});
            }
            for (const name of ['OnMentionPoll']) {
                app.connectorTrigger(name, ${options});
            }
            const functionNames = [
                'OnRowAdded', 'OnRowDeleted',
            ];
            for (const name of functionNames) {
                app.connectorTrigger(name, ${options});
            }
            for (const name of ['OnWebhook']) {
                app.connectorTrigger(name, { deliveryMode: DeliveryMode.Webhook, connection: 'ConnectorNamespace', triggerConfigName: \`%\${name}Config%\` });
            }
            for (const [name] of [['NotRegistered', 'x']]) {
                otherRegister(name, ${options});
            }
        `;
        const names = ['OnChangedPoll', 'OnNewPoll', 'OnMentionPoll', 'OnRowAdded', 'OnRowDeleted'];
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts'), names.map(functionName => ({
            connectionSettingName: 'ConnectorNamespace',
            functionName,
            triggerConfigSettingName: `${functionName}TriggerConfigName`,
        })));
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source, '.ts'), [...names, 'OnWebhook']);
    });

    test('only treats tuple registrars as Connector Triggers when their values identify one', () => {
        const options = `{
                deliveryMode: DeliveryMode.Poll,
                connection: 'ConnectorNamespace',
                triggerConfigName: \`%\${name}TriggerConfigName%\`,
            }`;
        const source = `
            const registrations = [
                ['OnSharePoint', connectors.sharepoint.onChangedItems],
                ['HttpHandler', app.http],
                ['NamedHandler', registerAny],
            ];
            for (const [name, register] of registrations) {
                register(name, ${options});
            }
            for (const [name, register] of [['Unrelated', registerAny]]) {
                register(name, {});
            }
            for (const [name, connectorTrigger] of [['Shadowed', app.http]]) {
                connectorTrigger(name, ${options});
            }
            for (const [name, ignored] of [['DirectConnector', app.http]]) {
                app.connectorTrigger(name, ${options});
            }
        `;
        const names = ['OnSharePoint', 'DirectConnector'];
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source, '.ts'), names);
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts'), names.map(functionName => ({
            connectionSettingName: 'ConnectorNamespace',
            functionName,
            triggerConfigSettingName: `${functionName}TriggerConfigName`,
        })));
    });

    test('only interpolates loop names in template literals', () => {
        const source = [
            `for (const name of ['Template']) {
                app.connectorTrigger(name, { deliveryMode: 'Poll', connection: 'ConnectorNamespace', triggerConfigName: \`%\${name}Config%\` });
            }`,
            `for (const name of ['SingleQuoted']) {
                app.connectorTrigger(name, { deliveryMode: 'Poll', connection: 'ConnectorNamespace', triggerConfigName: '%\${name}Config%' });
            }`,
            `for (const name of ['DoubleQuoted']) {
                app.connectorTrigger(name, { deliveryMode: 'Poll', connection: 'ConnectorNamespace', triggerConfigName: "%\${name}Config%" });
            }`,
            "for (const name of ['Escaped']) { app.connectorTrigger(name, { deliveryMode: 'Poll', connection: 'ConnectorNamespace', triggerConfigName: `%\\${name}Config%` }); }",
        ].join('\n');

        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts'), [
            { connectionSettingName: 'ConnectorNamespace', functionName: 'Template', triggerConfigSettingName: 'TemplateConfig' },
            { connectionSettingName: 'ConnectorNamespace', functionName: 'SingleQuoted', triggerConfigSettingName: '${name}Config' },
            { connectionSettingName: 'ConnectorNamespace', functionName: 'DoubleQuoted', triggerConfigSettingName: '${name}Config' },
        ]);
    });

    test('ignores template trigger configuration names that cannot be resolved statically', () => {
        const source = `
            app.connectorTrigger('OnChanged', {
                deliveryMode: DeliveryMode.Poll,
                connection: 'ConnectorNamespace',
                triggerConfigName: \`%\${prefix}TriggerConfigName%\`,
                handler: async () => {},
            });
        `;
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts'), []);
    });

    test('filters bindings for functions disabled by host settings', () => {
        const bindings = ['Enabled', 'DisabledTrue', 'DisabledOne', 'DisabledEither', 'Untrimmed', 'ExplicitlyEnabled'].map(functionName => ({
            connectionSettingName: 'ConnectorNamespace',
            functionName,
            triggerConfigSettingName: `${functionName}TriggerConfigName`,
        }));
        const values: Record<string, string> = {
            'AzureWebJobs.DisabledTrue.Disabled': 'True',
            ['AzureWebJobs_DisabledOne_Disabled']: '1',
            'AzureWebJobs.DisabledEither.Disabled': 'false',
            ['AzureWebJobs_DisabledEither_Disabled']: 'TRUE',
            'AzureWebJobs.Untrimmed.Disabled': ' true ',
            'AzureWebJobs.ExplicitlyEnabled.Disabled': 'false',
        };
        assert.deepStrictEqual(
            filterEnabledConnectorBindings(bindings, name => values[name]).map(binding => binding.functionName),
            ['Enabled', 'Untrimmed', 'ExplicitlyEnabled'],
        );
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

    test('ignores disabled TypeScript registrations in comments and strings', () => {
        const source = `
            /* app.connectorTrigger("Disabled", {
                connection: "OldConnection", triggerConfigName: "%OldConfig%", deliveryMode: "Poll" }); */
            // connectors.office365.onChanged("LineDisabled", { connection: "OldConnection", triggerConfigName: "%OldConfig%", deliveryMode: "Poll" });
            const docs = \`app.connectorTrigger("Example", { connection: "OldConnection", triggerConfigName: "%OldConfig%", deliveryMode: "Poll" })\`;
            app.connectorTrigger("OnChangedV3", {
                connection: "ConnectorConnection",
                triggerConfigName: "%ConnectorConfig%",
                deliveryMode: "Poll",
                handler: () => {},
            });
        `;
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts'), expected);
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source, '.ts'), ['OnChangedV3']);
    });

    test('ignores disabled C# attributes in comments', () => {
        const source = `
            // [Function("Disabled")]
            // public void Old([ConnectorTrigger(Connection = "OldConnection", TriggerConfigName = "%OldConfig%", DeliveryMode = ConnectorDeliveryMode.Poll)] object input) {}
            [Function("OnChangedV3")]
            public void Connector(
                /* [ConnectorTrigger(Connection = "OldConnection", TriggerConfigName = "%OldConfig%", DeliveryMode = ConnectorDeliveryMode.Poll)] */
                [ConnectorTrigger(
                    Connection = "ConnectorConnection",
                    TriggerConfigName = "%ConnectorConfig%",
                    DeliveryMode = ConnectorDeliveryMode.Poll)] object input) {}
        `;
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.cs'), expected);
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source, '.cs'), ['OnChangedV3']);
    });

    test('ignores disabled Python decorators in comments and docstrings', () => {
        const source = `
"""
@app.function_name(name="Example")
@app.connector_trigger(connection="OldConnection", trigger_config_name="%OldConfig%", delivery_mode=DeliveryMode.POLL)
def example(event):
"""
# @app.function_name(name="Disabled")
# @app.connector_trigger(connection="OldConnection", trigger_config_name="%OldConfig%", delivery_mode=DeliveryMode.POLL)
# def disabled(event):

@app.function_name(name="OnChangedV3")
@app.connector_trigger(connection="ConnectorConnection", trigger_config_name="%ConnectorConfig%", delivery_mode=DeliveryMode.POLL)
async def connector(event):
    pass
`;
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.py'), expected);
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source, '.py'), ['OnChangedV3']);
    });

    test('only reads host-loaded function.json files and skips malformed ones', async () => {
        const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connectorBindings'));
        try {
            const write = async (relativePath: string, content: string) => {
                const filePath = path.join(root, relativePath);
                await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
                await fs.promises.writeFile(filePath, content);
            };
            await write('host.json', '{}');
            await write('OnChangedV3/function.json', JSON.stringify({
                bindings: [{
                    type: 'connectorTrigger',
                    deliveryMode: 'Poll',
                    connection: 'ConnectorConnection',
                    triggerConfigName: '%ConnectorConfig%',
                }],
            }));
            await write('Broken/function.json', '{ not json');
            await write('tests/fixtures/Fixture/function.json', '{ not json');
            await write('tests/fixtures/Other/function.json', JSON.stringify({
                bindings: [{ type: 'connectorTrigger', deliveryMode: 'Poll', connection: 'Fixture', triggerConfigName: '%Fixture%' }],
            }));

            assert.deepStrictEqual(await findPollingConnectorBindings(root), expected);
            assert.deepStrictEqual(await findConnectorTriggerRegistrations(root), ['OnChangedV3']);
        } finally {
            await fs.promises.rm(root, { recursive: true, force: true });
        }
    });
});
