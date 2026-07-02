/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { hostStartTaskName, localhost } from '../src/constants';
import { defaultGoDebugPort, goDebugConfig } from '../src/debug/GoDebugProvider';

suite('debug/GoDebugProvider — config shape', () => {
    test('goDebugConfig matches what the Go extension expects for an external dlv attach', () => {
        // These values are the contract between this extension and the golang.go extension.
        // Changing any of them silently breaks F5 for every Go Functions user, so pin them down.
        assert.strictEqual(goDebugConfig.type, 'go');
        assert.strictEqual(goDebugConfig.request, 'attach');
        // mode 'remote' tells golang.go to connect to an externally-started dlv (the one our poller spawns)
        // rather than starting dlv itself.
        assert.strictEqual(goDebugConfig.mode, 'remote');
        assert.strictEqual(goDebugConfig.port, 2345);
        assert.strictEqual(goDebugConfig.host, localhost);
        assert.strictEqual(goDebugConfig.preLaunchTask, hostStartTaskName);
    });

    test('defaultGoDebugPort matches goDebugConfig.port', () => {
        // GoDebugProvider falls back to defaultGoDebugPort if the resolved config is missing a port,
        // so the two must stay aligned.
        assert.strictEqual(defaultGoDebugPort, goDebugConfig.port);
    });
});
