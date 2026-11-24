/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isEndOfLifeDotnetVersion } from '../src/commands/createFunctionApp/stacks/getStackPicks';
import { type AppStackMajorVersion, type AppStackMinorVersion } from '../src/commands/createFunctionApp/stacks/models/AppStackModel';
import { type FunctionAppRuntimeSettings, type FunctionAppRuntimes, type FunctionAppStack } from '../src/commands/createFunctionApp/stacks/models/FunctionAppStackModel';

suite('isEndOfLifeDotnetVersion', () => {
    const now = new Date('2026-11-13T00:00:00Z');

    function settings(endOfLifeDate?: string): FunctionAppRuntimeSettings {
        return <FunctionAppRuntimeSettings>{ endOfLifeDate };
    }

    function check(stackValue: string, majorValue: string, stackSettings: FunctionAppRuntimes): boolean {
        const minorVersion: AppStackMinorVersion<FunctionAppRuntimes> = { displayText: majorValue, value: majorValue, stackSettings };
        const majorVersion: AppStackMajorVersion<FunctionAppRuntimes> = { displayText: majorValue, value: majorValue, minorVersions: [minorVersion] };
        const stack = <FunctionAppStack>{ displayText: stackValue, value: stackValue, majorVersions: [majorVersion] };
        return isEndOfLifeDotnetVersion(stack, majorVersion, minorVersion, now);
    }

    test('Past end-of-life date on all OSes', () => {
        assert.strictEqual(check('dotnet', 'dotnet8isolated', { linuxRuntimeSettings: settings('2026-11-10T00:00:00Z'), windowsRuntimeSettings: settings('2026-11-10T00:00:00Z') }), true);
    });

    test('Past end-of-life date on the only defined OS', () => {
        assert.strictEqual(check('dotnet', 'dotnet8isolated', { linuxRuntimeSettings: settings('2026-11-10T00:00:00Z') }), true);
    });

    test('Past end-of-life date on only one of two OSes', () => {
        assert.strictEqual(check('dotnet', 'dotnet8isolated', { linuxRuntimeSettings: settings('2026-11-10T00:00:00Z'), windowsRuntimeSettings: settings('2028-11-10T00:00:00Z') }), false);
    });

    test('Future end-of-life date', () => {
        assert.strictEqual(check('dotnet', 'dotnet10isolated', { linuxRuntimeSettings: settings('2028-11-14T00:00:00Z'), windowsRuntimeSettings: settings('2028-11-14T00:00:00Z') }), false);
    });

    test('No end-of-life date', () => {
        assert.strictEqual(check('dotnet', 'dotnet11isolated', { linuxRuntimeSettings: settings(), windowsRuntimeSettings: settings() }), false);
    });

    test('No runtime settings', () => {
        assert.strictEqual(check('dotnet', 'dotnet11isolated', {}), false);
    });

    test('Known end-of-life version without an end-of-life date', () => {
        assert.strictEqual(check('dotnet', 'dotnet7isolated', { linuxRuntimeSettings: settings(), windowsRuntimeSettings: settings() }), true);
        assert.strictEqual(check('dotnet', 'dotnet6isolated', { windowsRuntimeSettings: settings() }), true);
        assert.strictEqual(check('dotnet', 'dotnet6', { linuxRuntimeSettings: settings() }), true);
    });

    test('Non-.NET stack is never filtered', () => {
        assert.strictEqual(check('node', 'node14', { linuxRuntimeSettings: settings('2023-04-30T00:00:00Z'), windowsRuntimeSettings: settings('2023-04-30T00:00:00Z') }), false);
    });
});
