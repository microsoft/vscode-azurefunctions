/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    type ConnectorTriggerOutputSchema,
    getCSharpOutputModelDefinition,
    getPythonOutputModelDefinition,
    parseConnectorTriggerOutputMetadata,
} from '../../src/connectorTrigger/connectorTriggerOutputSchema';

suite('Connector trigger output schema', () => {
    const collidingSchema: ConnectorTriggerOutputSchema = {
        collectionPath: 'body',
        modelName: 'Contact',
        schemaName: 'Contact',
        properties: ['contact', 'fullName', 'full_name', 'fullName2'].map(name => ({
            name,
            required: false,
            type: { kind: 'scalar', type: 'string' },
        })),
    };

    test('allocates distinct C# members and reserves the enclosing class name', () => {
        const definition = getCSharpOutputModelDefinition(collidingSchema, 'Contact');
        assert.deepStrictEqual(
            [...definition.matchAll(/public string\? (\w+) \{/g)].map(match => match[1]),
            ['Contact2', 'FullName', 'FullName2', 'FullName22'],
        );
        for (const property of collidingSchema.properties) {
            assert.ok(definition.includes(`[JsonPropertyName("${property.name}")]`));
        }
    });

    test('rejects lossy Python models explicitly instead of overwriting dataclass fields', () => {
        assert.throws(() => getPythonOutputModelDefinition(collidingSchema, 'Contact'),
            /same Python field/);
        for (const names of [['fullName', 'full_name'], ['class', 'class_'], ['123', 'value_123']]) {
            assert.deepStrictEqual(parseConnectorTriggerOutputMetadata({
                paths: {
                    '/event': {
                        get: {
                            operationId: 'Event',
                            responses: {
                                200: {
                                    schema: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: Object.fromEntries(names.map(name => [name, { type: 'string' }])),
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }, 'Event'), { limitation: 'unsupported-output-schema' });
        }
    });

    test('preserves Python required-first ordering and noncolliding field normalization', () => {
        assert.strictEqual(getPythonOutputModelDefinition({
            ...collidingSchema,
            properties: [
                { name: 'fullName', required: false, type: { kind: 'scalar', type: 'string' } },
                { name: 'id', required: true, type: { kind: 'scalar', type: 'integer' } },
            ],
        }, 'Contact'), '@dataclass\nclass Contact:\n    id: int\n    full_name: Optional[str] = None');
    });

    test('preserves the live Act Contact array and optional wire properties', async () => {
        const metadata = parseConnectorTriggerOutputMetadata(
            await readFixture('actTrigNewContactSwagger.json'),
            'TrigNewContact',
        );

        assert.strictEqual(metadata.limitation, undefined);
        assert.strictEqual(metadata.schema?.collectionPath, 'body');
        assert.strictEqual(metadata.schema?.schemaName, 'act.web.api.models.Contact');
        assert.strictEqual(metadata.schema?.modelName, 'Contact');
        assert.deepStrictEqual(metadata.schema?.properties, [
            optionalScalar('id'),
            optionalScalar('fullName'),
            optionalScalar('emailAddress'),
            optionalScalar('company'),
            optionalScalar('idStatus'),
            optionalScalar('referredBy'),
            optionalScalar('jobTitle'),
            optionalScalar('businessPhone'),
            optionalScalar('mobilePhone'),
            {
                name: 'customFields',
                required: false,
                type: {
                    kind: 'map',
                    valueType: 'string',
                },
            },
        ]);
    });

    test('preserves the live RSS value array and explicit required property', async () => {
        const metadata = parseConnectorTriggerOutputMetadata(
            await readFixture('rssOnNewFeedSwagger.json'),
            'OnNewFeed',
        );

        assert.strictEqual(metadata.limitation, undefined);
        assert.strictEqual(metadata.schema?.collectionPath, 'body.value');
        assert.strictEqual(metadata.schema?.schemaName, 'FeedItem');
        assert.strictEqual(metadata.schema?.modelName, 'FeedItem');
        assert.strictEqual(
            metadata.schema?.properties.find(property =>
                property.name === 'title')?.required,
            true,
        );
        assert.deepStrictEqual(
            metadata.schema?.properties.find(property =>
                property.name === 'links')?.type,
            {
                kind: 'array',
                itemType: 'string',
            },
        );
        assert.deepStrictEqual(
            metadata.schema?.properties.find(property =>
                property.name === 'updatedOn')?.type,
            {
                kind: 'scalar',
                type: 'string',
            },
        );
    });

    test('returns an explicit limitation for unsupported output shapes', () => {
        assert.deepStrictEqual(
            parseConnectorTriggerOutputMetadata({
                swagger: '2.0',
                paths: {
                    '/event': {
                        get: {
                            operationId: 'DynamicEvent',
                            responses: {
                                200: {
                                    schema: {},
                                },
                            },
                        },
                    },
                },
            }, 'DynamicEvent'),
            { limitation: 'unsupported-output-schema' },
        );
    });
});

function optionalScalar(name: string): unknown {
    return {
        name,
        required: false,
        type: {
            kind: 'scalar',
            type: 'string',
        },
    };
}

async function readFixture(name: string): Promise<unknown> {
    return JSON.parse(await fs.promises.readFile(
        path.join(
            __dirname,
            '..',
            '..',
            'test',
            'fixtures',
            'connectorTriggerPicker',
            name,
        ),
        'utf8',
    ));
}
