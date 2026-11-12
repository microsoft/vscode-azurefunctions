/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { validateConnectorNamespaceName } from '../../src/commands/createFunction/connectorSteps/validateConnectorNamespaceName';

suite('Connector Namespace name validation', () => {
    test('validates connector namespace names', () => {
        for (const name of ['ab', 'connector-namespace', 'connector_namespace', `a${'b'.repeat(63)}`]) {
            assert.strictEqual(validateConnectorNamespaceName(name), undefined, name);
        }

        for (const name of ['', 'a', '-namespace', '_namespace', 'connector namespace', 'connector/namespace', `a${'b'.repeat(64)}`]) {
            assert.ok(validateConnectorNamespaceName(name), name);
        }
    });
});