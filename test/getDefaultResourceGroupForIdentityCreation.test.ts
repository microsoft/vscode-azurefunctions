/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getDefaultResourceGroupForIdentityCreation } from '../src/commands/addMIConnections/addRemoteMIConnections';
import { type AddMIConnectionsContext } from '../src/commands/addMIConnections/AddMIConnectionsContext';

suite('getDefaultResourceGroupForIdentityCreation', () => {
    test('returns undefined when function app is missing', () => {
        assert.strictEqual(getDefaultResourceGroupForIdentityCreation({} as AddMIConnectionsContext), undefined);
    });

    test('returns resource group and location from function app site', () => {
        const context = {
            functionapp: {
                site: {
                    resourceGroup: 'rg-test',
                    location: 'westus2',
                },
            },
        } as AddMIConnectionsContext;

        assert.deepStrictEqual(getDefaultResourceGroupForIdentityCreation(context), {
            name: 'rg-test',
            location: 'westus2',
        });
    });
});
