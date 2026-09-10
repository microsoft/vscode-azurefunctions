/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisableSyncTriggersForMcpExecuteStep } from '../src/commands/deploy/DisableSyncTriggersForMcpExecuteStep';

suite('DisableSyncTriggersForMcpExecuteStep', () => {
    test('should execute only for MCP projects', async () => {
        const step = new DisableSyncTriggersForMcpExecuteStep();

        assert.strictEqual(step.shouldExecute({ isMcpProject: true } as never), true);
        assert.strictEqual(step.shouldExecute({ isMcpProject: false } as never), false);
    });

    test('disables post-deploy trigger sync when executed', async () => {
        const step = new DisableSyncTriggersForMcpExecuteStep();
        const context: { syncTriggersPostDeploy: boolean } = { syncTriggersPostDeploy: true };

        await step.execute(context as never);

        assert.strictEqual(context.syncTriggersPostDeploy, false);
    });
});
