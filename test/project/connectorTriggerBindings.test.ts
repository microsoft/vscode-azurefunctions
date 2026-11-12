/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    findConnectorTriggerRegistrations,
    findPollingConnectorBindings,
    getConnectorTriggerRegistrations,
    getPollingConnectorBindings,
    updateTypeScriptConnectorTriggerSource,
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

    test('discovers enum Poll bindings without accepting Webhook or nested Poll values', () => {
        const source = `
            import { DeliveryMode } from '@azure/functions';
            const options = {
                deliveryMode: DeliveryMode.Poll,
                connection: "ConnectorConnection",
                triggerConfigName: "%ConnectorConfig%",
            };
            connectorTrigger("OnChangedV3", options);
            connectors.office365.onChanged("Webhook", {
                deliveryMode: DeliveryMode.Webhook,
                connection: "Wrong",
                triggerConfigName: "%Wrong%",
                handler: () => ({ deliveryMode: DeliveryMode.Poll }),
            });
        `;
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts'), expected);
    });

    test('discovers a Functions DeliveryMode import alias without accepting unrelated aliases', () => {
        const source = `import { DeliveryMode as FunctionMode } from '@azure/functions';
connectorTrigger("OnChangedV3", {
    deliveryMode: FunctionMode.Poll,
    connection: "ConnectorConnection",
    triggerConfigName: "%ConnectorConfig%",
});
`;
        assert.deepStrictEqual(getPollingConnectorBindings(source, '.ts'), expected);
        assert.strictEqual(updateTypeScriptConnectorTriggerSource(source), source);
        assert.deepStrictEqual(getPollingConnectorBindings(source.replace('@azure/functions', './other'), '.ts'), []);
        assert.deepStrictEqual(getPollingConnectorBindings(source.replace('import {', 'import type {'), '.ts'), []);
    });

    test('merges enum imports without duplicating or discarding type-only imports', () => {
        const imports = [
            {
                before: "import { type DeliveryMode, InvocationContext } from '@azure/functions';",
                after: "import { DeliveryMode, InvocationContext } from '@azure/functions';",
            },
            {
                before: "import type { DeliveryMode, InvocationContext } from '@azure/functions';",
                after: "import { DeliveryMode, type InvocationContext } from '@azure/functions';",
            },
            {
                before: "import type { InvocationContext } from '@azure/functions';",
                after: "import { DeliveryMode } from '@azure/functions';\nimport type { InvocationContext } from '@azure/functions';",
            },
        ];
        for (const { before, after } of imports) {
            const source = `${before}
connectorTrigger("OnChangedV3", {
    deliveryMode: "Poll",
    connection: "ConnectorConnection",
    triggerConfigName: "%ConnectorConfig%",
});
`;
            const updated = updateTypeScriptConnectorTriggerSource(source);
            assert.ok(updated.includes(after));
            assert.deepStrictEqual(getPollingConnectorBindings(updated, '.ts'), expected);
            assert.strictEqual(updateTypeScriptConnectorTriggerSource(updated), updated);
        }
    });

    test('avoids conflicting DeliveryMode bindings and reuses an existing Functions namespace', () => {
        const imports = [
            {
                before: "import { DeliveryMode } from './other';",
                after: "import * as azureFunctions from '@azure/functions';",
                expression: 'azureFunctions.DeliveryMode.Poll',
            },
            {
                before: "const DeliveryMode = 'unrelated';",
                after: "import * as azureFunctions from '@azure/functions';",
                expression: 'azureFunctions.DeliveryMode.Poll',
            },
            {
                before: "import * as functions from '@azure/functions';\nconst DeliveryMode = 'unrelated';",
                after: "import * as functions from '@azure/functions';",
                expression: 'functions.DeliveryMode.Poll',
            },
            {
                before: "const docs = `\nimport * as functions from '@azure/functions';\n`;\nconst DeliveryMode = 'unrelated';",
                after: "import * as azureFunctions from '@azure/functions';",
                expression: 'azureFunctions.DeliveryMode.Poll',
            },
        ];
        for (const { before, after, expression } of imports) {
            const source = `${before}
connectorTrigger("OnChangedV3", {
    deliveryMode: "Poll",
    connection: "ConnectorConnection",
    triggerConfigName: "%ConnectorConfig%",
});
`;
            const updated = updateTypeScriptConnectorTriggerSource(source);
            assert.ok(updated.includes(after));
            assert.ok(updated.includes(`deliveryMode: ${expression}`));
            assert.deepStrictEqual(getPollingConnectorBindings(updated, '.ts'), expected);
            assert.strictEqual(updateTypeScriptConnectorTriggerSource(updated), updated);
        }
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
