/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { type HttpRequest, type HttpResponseBinding } from '../../src/azureInvoke/models/httpSchema';
import { resolveRequestBindings, type HttpInvocationResult } from '../../src/azureInvoke/triggers/http/resolveRequestBindings';
import { validateRequestTemplate } from '../../src/azureInvoke/triggers/http/validateRequestTemplate';
import { request } from './azureInvokeTestUtils';
import { invokeErrorPatterns, uuidV4Pattern } from './invokeTestExpectations';

const url = 'http://localhost/accounts';
const sourceId = 'create-account';
const bindingErrorPatterns = {
    invalidResponseJson: /linked response body is not valid JSON/,
    nonPrimitiveTextValue: /must select a string, number, or boolean/,
    dotPathSegment: /cannot be a dot path segment/,
};
const templateErrorPatterns = {
    undeclaredVariable: /variable is not defined/,
    malformedVariable: /form \{\{name\}\}/,
    invalidJsonTemplate: /JSON with quoted placeholders/,
    variableInFieldName: /field values, not field names/,
    unnamedQueryParameter: /Enter a name for each query parameter/,
};

function template(overrides: Partial<HttpRequest> = {}): HttpRequest {
    return request({ method: 'POST', url, ...overrides });
}

function binding(name: string, pointer: string): HttpResponseBinding {
    return { sourceId, name, pointer };
}

function result(responseBody: string, sentBody = ''): HttpInvocationResult {
    return {
        request: template({ body: sentBody }),
        response: { body: responseBody, status: 201, duration: 0, headers: [{ name: 'X-Account', value: 'primary' }] },
    };
}

function unexpectedLookup(): never {
    assert.fail('This template should not need a prerequisite result.');
}

suite('Azure Invoke resolveRequestBindings', () => {
    test('preserves selected JSON types, resolves nested values, and leaves the template unchanged', () => {
        const input = template({
            body: '{"items":["{{account}}","{{tags}}","{{active}}","{{empty}}","{{count}}","Count: {{count}}"]}',
            dependsOn: [sourceId],
            bindings: [
                binding('account', '/body/accounts/0'),
                binding('tags', '/body/tags'),
                binding('active', '/body/active'),
                binding('empty', '/body/empty'),
                binding('count', '/body/a~1b/~0count'),
            ],
        });
        const original = structuredClone(input);
        const resolved = resolveRequestBindings(input, id => {
            assert.strictEqual(id, sourceId);
            return result('{"accounts":[{"id":42}],"tags":["trial"],"active":false,"empty":null,"a/b":{"~count":0}}');
        });

        assert.deepStrictEqual(JSON.parse(resolved.body), { items: [{ id: 42 }, ['trial'], false, null, 0, 'Count: 0'] });
        assert.ok(!Object.hasOwn(resolved, 'bindings'));
        assert.ok(!Object.hasOwn(resolved, 'dependsOn'));
        assert.deepStrictEqual(input, original);
    });

    test('reads the sent JSON, response header and status without parsing an empty response body', () => {
        // An empty response body must not prevent bindings that read other parts of the result.
        const resolved = resolveRequestBindings(template({
            body: 'client={{clientId}}; account={{account}}; status={{status}}',
            bindings: [binding('clientId', '/request/body/clientId'), binding('account', '/headers/x-account'), binding('status', '/status')],
        }), () => result('', '{"clientId":"abc"}'));

        assert.strictEqual(resolved.body, 'client=abc; account=primary; status=201');
    });

    test('encodes URL substitutions and leaves query row values raw for transport', () => {
        const resolved = resolveRequestBindings(template({
            url: `${url}/{{slug}}?filter={{slug}}`,
            headers: [{ name: 'X-Account', value: 'account={{slug}}' }],
            query: [{ name: 'tag', value: '{{slug}}' }, { name: 'ignored', value: '{{missing}}', enabled: false }],
            bindings: [binding('slug', '/body/slug')],
        }), () => result('{"slug":"a/b & c"}'));

        assert.strictEqual(resolved.url, `${url}/a%2Fb%20%26%20c?filter=a%2Fb%20%26%20c`);
        assert.deepStrictEqual(resolved.headers, [{ name: 'X-Account', value: 'account=a/b & c' }]);
        assert.deepStrictEqual(resolved.query, [{ name: 'tag', value: 'a/b & c' }, { name: 'ignored', value: '{{missing}}', enabled: false }]);
    });

    test('uses the same generated UUID throughout a request', () => {
        const resolved = resolveRequestBindings(template({
            url: `${url}/{{guid}}`,
            body: '{"id":"{{guid}}"}',
            headers: [{ name: 'X-Request-ID', value: '{{guid}}' }],
        }), unexpectedLookup);
        const [header] = resolved.headers;

        assert.match(header.value, uuidV4Pattern);
        assert.strictEqual(resolved.url, `${url}/${header.value}`);
        assert.strictEqual(resolved.body, JSON.stringify({ id: header.value }));
    });

    // Cover an unsupported root, a missing field, and array selectors that do not address an item.
    for (const pointer of ['/response/body/id', '/body/missing', '/body/items/length', '/body/items/1']) {
        test(`rejects unavailable selector ${pointer}`, () => {
            const input = template({ body: '{"id":"{{value}}"}', bindings: [binding('value', pointer)] });
            assert.throws(() => resolveRequestBindings(input, () => result('{"id":42,"items":[1]}')), invokeErrorPatterns.missingBindingField);
        });
    }

    test('rejects invalid JSON only on the side selected by the binding', () => {
        const input = template({ body: '{{value}}' });
        const run = result('not JSON', 'also not JSON');
        assert.throws(() => resolveRequestBindings({ ...input, bindings: [binding('value', '/body')] }, () => run), bindingErrorPatterns.invalidResponseJson);
        assert.throws(() => resolveRequestBindings({ ...input, bindings: [binding('value', '/request/body')] }, () => run), invokeErrorPatterns.invalidLinkedRequestJson);
    });

    test('rejects objects embedded in text and dot segments in URL variables', () => {
        const input = template({ body: 'Account: {{value}}', bindings: [binding('value', '/body')] });
        assert.throws(() => resolveRequestBindings(input, () => result('{"id":42}')), bindingErrorPatterns.nonPrimitiveTextValue);
        for (const segment of ['.', '..']) {
            assert.throws(() => resolveRequestBindings({ ...input, url: `${url}/{{value}}` }, () => result(JSON.stringify(segment))), bindingErrorPatterns.dotPathSegment);
        }
    });
});

suite('Azure Invoke validateRequestTemplate', () => {
    test('accepts known placeholders in values without changing the saved template', () => {
        const input = template({
            url: `${url}/{{2fa-code}}`,
            body: '[{"account":{"id":"{{2fa-code}}","clientId":"{{guid}}"}}]',
            headers: [{ name: 'X-Account', value: '{{2fa-code}}' }, { name: '{{ignored}}', value: '{{broken', enabled: false }],
            query: [{ name: 'id', value: '{{2fa-code}}' }, { name: '{{ignored}}', value: '{{undeclared}}', enabled: false }],
            bindings: [binding('2fa-code', '/body/code')],
        });
        const original = structuredClone(input);

        assert.strictEqual(validateRequestTemplate(input), undefined);
        assert.deepStrictEqual(input, original);
    });

    test('accepts plain text placeholders when a JSON content type is disabled', () => {
        validateRequestTemplate(template({
            body: 'Client: {{guid}}',
            headers: [{ name: 'Content-Type', value: 'application/json', enabled: false }],
        }));
    });

    const invalidTemplates: { label: string; overrides: Partial<HttpRequest>; error: RegExp }[] = [
        // Placeholder syntax and placement.
        { label: 'a variable in the host', overrides: { url: 'http://{{guid}}/accounts' }, error: invokeErrorPatterns.variableInUrlHost },
        { label: 'an undeclared variable', overrides: { body: 'Client: {{missing}}' }, error: templateErrorPatterns.undeclaredVariable },
        { label: 'a malformed variable', overrides: { body: 'Client: {{guid' }, error: templateErrorPatterns.malformedVariable },
        { label: 'an unquoted JSON variable', overrides: { body: '{"id":{{guid}}}' }, error: templateErrorPatterns.invalidJsonTemplate },
        {
            label: 'plain text declared as JSON',
            overrides: { body: 'Client: {{guid}}', headers: [{ name: 'CONTENT-TYPE', value: 'application/json' }] },
            error: templateErrorPatterns.invalidJsonTemplate,
        },
        { label: 'a variable in a nested JSON field name', overrides: { body: '{"accounts":[{"{{guid}}":1}]}' }, error: templateErrorPatterns.variableInFieldName },
        { label: 'a variable in an enabled header name', overrides: { headers: [{ name: 'X-{{guid}}', value: 'value' }] }, error: templateErrorPatterns.variableInFieldName },
        { label: 'a variable in an enabled query name', overrides: { query: [{ name: '{{guid}}', value: 'value' }] }, error: templateErrorPatterns.variableInFieldName },

        // Requests must satisfy HTTP validation even when their placeholders are valid.
        { label: 'a body on GET', overrides: { method: 'GET', body: 'data' }, error: invokeErrorPatterns.bodyOnGetOrHead },
        { label: 'a body on HEAD', overrides: { method: 'HEAD', body: 'data' }, error: invokeErrorPatterns.bodyOnGetOrHead },
        { label: 'an unnamed query parameter', overrides: { query: [{ name: '', value: '{{guid}}' }] }, error: templateErrorPatterns.unnamedQueryParameter },
    ];

    for (const { label, overrides, error } of invalidTemplates) {
        test(`rejects ${label}`, () => {
            assert.throws(() => validateRequestTemplate(template(overrides)), error);
        });
    }
});
