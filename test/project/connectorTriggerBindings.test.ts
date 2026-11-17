/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInNewContext } from 'vm';
import {
    filterEnabledConnectorBindings,
    findConnectorTriggerRegistrations,
    findPollingConnectorBindings,
    getConnectorTriggerRegistrations,
    getPollingConnectorBindings,
    getWebhookConnectorRegistrations,
} from '../../src/connectorTrigger/connectorTriggerBindings';

suite('Connector trigger binding discovery', () => {
    test('detects default and explicit webhook delivery without treating incomplete Poll bindings as webhooks', () => {
        for (const [extension, source] of [
            ['.cs', `[Function("Webhook")] public void Run([ConnectorTrigger] string payload) {}
[Function("Poll")] public void Poll([ConnectorTrigger(DeliveryMode = Mode.Poll)] string payload) {}`],
            ['.py', `@app.function_name(name="Webhook")
@app.connector_trigger(arg_name="event")
def webhook(event):
    pass
@app.function_name(name="Poll")
@app.connector_trigger(arg_name="event", delivery_mode=Mode.POLL)
def poll(event):
    pass
`],
            ['.ts', `app.connectorTrigger("Webhook", { handler: () => {} });
const options = { deliveryMode: Mode.Webhook, handler: () => {} };
app.connectorTrigger("ExplicitWebhook", options);
app.connectorTrigger("Poll", { deliveryMode: "Poll", handler: () => {} });
// app.connectorTrigger("Comment", { handler: () => {} });`],
        ]) {
            assert.deepStrictEqual(getWebhookConnectorRegistrations(source, extension),
                extension === '.ts' ? ['Webhook', 'ExplicitWebhook'] : ['Webhook']);
        }
        assert.deepStrictEqual(getWebhookConnectorRegistrations(`connectors.office365.onNewEmail('OnNewEmail', {
    handler: async (context: NewEmailTriggerContext, invocationContext: InvocationContext) => {
        invocationContext.log(\`Subject: '\${context.subject}'.\`);
        return context.rawPayload;
    },
});
connectors.office365.onNewEmail('OnNewEmailPoll', { deliveryMode: DeliveryMode.Poll, handler: async () => {} });`, '.ts'), ['OnNewEmail']);
    });

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

    test('resolves named loop arrays from their lexical scope', () => {
        const options = "{ deliveryMode: 'Poll', connection: 'ConnectorNamespace', triggerConfigName: `%${name}Config%` }";
        const source = `
            const names = ['Outer'];
            function first() {
                const names = ['First'];
                for (const name of names) { app.connectorTrigger(name, ${options}); }
            }
            function second() {
                const names = ['Second'];
                for (const name of names) { app.connectorTrigger(name, ${options}); }
            }
            first();
            second();
            for (const name of names) { app.connectorTrigger(name, ${options}); }
        `;
        const names = ['First', 'Second', 'Outer'];
        const executed: string[] = [];
        runInNewContext(source, { app: { connectorTrigger: (name: string) => executed.push(name) } });
        assert.deepStrictEqual(executed, names);
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source, '.ts'), names);
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts').map(binding => binding.functionName), names);
    });

    test('does not resolve loop arrays shadowed by parameters or non-static bindings', () => {
        const options = "{ deliveryMode: 'Poll', connection: 'ConnectorNamespace', triggerConfigName: `%${name}Config%` }";
        const loop = `for (const name of names) { app.connectorTrigger(name, ${options}); }`;
        for (const scoped of [
            `function register(names: string[]): void { ${loop} }`,
            `const register = (prefix = 'x', names?: string[]) => { ${loop} };`,
            `const register = names => { ${loop} };`,
            `try { load(); } catch (names) { ${loop} }`,
            `{ let names = ['Mutable']; ${loop} }`,
        ]) {
            const source = `const names = ['Outer'];\n${scoped}`;
            assert.throws(() => getConnectorTriggerRegistrations(source, '.ts'), /Cannot determine Connector Trigger registrations/, scoped);
            assert.throws(() => getPollingConnectorBindings(source, '.ts'), /Cannot determine Connector Trigger registrations/, scoped);
        }
        // Control-flow headers and unrelated parameters do not shadow the array.
        const source = `const names = ['Outer'];\nfunction register(other: string) { if (names.length) { ${loop} } }`;
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source, '.ts'), ['Outer']);
    });

    test('expands only the registrations reached by each loop element', () => {
        const options = "{ deliveryMode: 'Poll', connection: 'ConnectorNamespace', triggerConfigName: `%${name}Config%` }";
        const source = `
            for (const name of ['Included', 'Excluded']) {
                if (name === 'Included') { app.connectorTrigger(name, ${options}); }
            }
            for (const name of ['Skipped', 'Kept']) {
                if (name === 'Skipped') continue;
                app.connectorTrigger(name, ${options});
            }
            for (const name of ['FirstBranch', 'SecondBranch']) {
                if (name !== 'FirstBranch') { app.connectorTrigger(name, ${options}); }
                else { app.connectorTrigger(name, ${options}); }
            }
            for (const name of ['BeforeBreak', 'Stop', 'AfterBreak']) {
                if (name === 'Stop') break;
                console.log('continue');
                app.connectorTrigger(name, ${options});
            }
        `;
        const names = ['Included', 'Kept', 'FirstBranch', 'SecondBranch', 'BeforeBreak'];
        const executed: string[] = [];
        runInNewContext(source, { app: { connectorTrigger: (name: string) => executed.push(name) }, console: { log: () => undefined } });
        assert.deepStrictEqual(executed, names);
        assert.deepStrictEqual(getConnectorTriggerRegistrations(source, '.ts'), names);
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts').map(binding => binding.functionName), names);
    });

    test('reports unsupported dynamic control flow instead of inventing or omitting loop events', () => {
        const options = "{ deliveryMode: 'Poll', connection: 'ConnectorNamespace', triggerConfigName: `%${name}Config%` }";
        for (const statement of [
            `if (isEnabled(name)) { app.connectorTrigger(name, ${options}); }`,
            `if (isEnabled(name)) continue; app.connectorTrigger(name, ${options});`,
            `isEnabled(name) && app.connectorTrigger(name, ${options});`,
        ]) {
            const source = `for (const name of ['First', 'Second']) { ${statement} }`;
            assert.throws(() => getConnectorTriggerRegistrations(source, '.ts'), /Cannot determine Connector Trigger registrations/);
            assert.throws(() => getPollingConnectorBindings(source, '.ts'), /Cannot determine Connector Trigger registrations/);
        }
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
                if (isEnabled(name)) { register(name, {}); }
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
