/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { type IFunctionAppWizardContext } from '../src/commands/createFunctionApp/IFunctionAppWizardContext';
import { getStackPicks } from '../src/commands/createFunctionApp/stacks/getStackPicks';
import { FuncVersion } from '../src/FuncVersion';
import './global.test';

suite('getStackPicks', () => {
    async function createContext(): Promise<IFunctionAppWizardContext> {
        return <IFunctionAppWizardContext><unknown>Object.assign(await createTestActionContext(), {
            version: FuncVersion.v4,
            subscriptionId: 'test-subscription',
            // Nothing listens on this port and the token request always fails, so the stacks API call throws and the backup stacks are used
            environment: { resourceManagerEndpointUrl: 'http://127.0.0.1:9' },
            credentials: { getToken: async () => { throw new Error('Offline test credential'); } },
        });
    }

    test('Offers a supported .NET runtime when the stacks API fails', async () => {
        const context = await createContext();
        const picks = await getStackPicks(context, false);

        assert.ok(context.telemetry.properties.getStacksError, 'Expected the stacks API call to fail and fall back to the backup stacks.');

        const dotnetValues: string[] = picks
            .filter(p => p.data?.stack.value === 'dotnet')
            .map(p => p.data!.majorVersion.value);

        assert.ok(dotnetValues.includes('dotnet10isolated'), `Expected .NET 10 isolated in the picks. Found: ${dotnetValues.join(', ')}`);
        for (const eolValue of ['dotnet6', 'dotnet6isolated', 'dotnet7isolated']) {
            assert.ok(!dotnetValues.includes(eolValue), `Expected end-of-life runtime "${eolValue}" to be hidden.`);
        }
    });
});
