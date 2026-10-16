/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FuncVersion } from '../src/FuncVersion';
import { DotnetInitVSCodeStep } from '../src/commands/initProjectForVSCode/InitVSCodeStep/DotnetInitVSCodeStep';

class TestDotnetInitVSCodeStep extends DotnetInitVSCodeStep {
    public getDebugConfigurationForTest(version: FuncVersion) {
        return this.getDebugConfiguration(version);
    }
}

suite('.NET initialization', () => {
    test('builds before resolving the Functions worker process', () => {
        const config = new TestDotnetInitVSCodeStep().getDebugConfigurationForTest(FuncVersion.v4);

        assert.strictEqual(config.funcBuildTask, 'build (functions)');
        assert.strictEqual(config.preLaunchTask, undefined);
        assert.strictEqual(config.processId, '${command:azureFunctions.pickProcess}');
    });
});
