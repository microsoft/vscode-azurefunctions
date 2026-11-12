/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ChildProcess } from 'child_process';
import { localize } from '../../../localize';
import { runConnectorHostLauncher } from './connectorHostLauncher';

const controller = new AbortController();
let child: ChildProcess | undefined;

// The terminal delivers Ctrl+C to Core Tools directly; before it starts, interruption cancels the launch.
process.on('SIGINT', () => {
    if (!child) {
        controller.abort();
    }
});
for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
        if (child) {
            child.kill(signal);
        } else {
            controller.abort();
        }
    });
}

runConnectorHostLauncher({
    args: process.argv.slice(2),
    environment: process.env,
    cwd: process.cwd(),
    writeError: message => process.stderr.write(`${message}\n`),
    onChild: started => child = started,
    signal: controller.signal,
}).then(
    code => process.exit(code),
    () => {
        process.stderr.write(`${localize('connectorLauncherUnexpectedFailure', 'Azure Functions: The Connector host launcher failed. The Functions host was not started.')}\n`);
        process.exit(1);
    },
);
