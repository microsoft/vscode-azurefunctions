/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { azdWindowsInstallPreamble, runAzdInstallTask } from '../src/azd/installAzd';

suite('Azure Developer CLI installer task', () => {
    function exitCommand(code: number): [string, string[]] {
        return process.platform === 'win32' ?
            ['cmd.exe', ['/d', '/c', `exit ${code}`]] :
            ['/bin/sh', ['-c', `exit ${code}`]];
    }

    test('waits for a successful process', async function (this: Mocha.Context): Promise<void> {
        this.timeout(30000);
        const [executable, args] = exitCommand(0);
        await runAzdInstallTask(executable, args);
    });

    test('reports a failing process', async function (this: Mocha.Context): Promise<void> {
        this.timeout(30000);
        const [executable, args] = exitCommand(7);
        await assert.rejects(runAzdInstallTask(executable, args), /installation did not complete successfully/i);
    });

    test('passes the PowerShell installer expression as one argument', async function (this: Mocha.Context): Promise<void> {
        if (process.platform !== 'win32') {
            this.skip();
        }
        this.timeout(30000);
        const expression = "$ErrorActionPreference = 'Stop'; & ([scriptblock]::Create('exit 0'))";
        await runAzdInstallTask('powershell', ['-NoProfile', '-ExecutionPolicy', 'AllSigned', '-Command', expression]);
    });

    test('loads the Windows signature module when another module shadows it', async function (this: Mocha.Context): Promise<void> {
        if (process.platform !== 'win32') {
            this.skip();
        }
        this.timeout(30000);
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azd-installer-module-'));
        try {
            const moduleDirectory = path.join(directory, 'Microsoft.PowerShell.Security');
            await fs.promises.mkdir(moduleDirectory);
            await fs.promises.writeFile(path.join(moduleDirectory, 'Microsoft.PowerShell.Security.psm1'),
                "function Get-AuthenticodeSignature { throw 'Wrong module loaded' }\nExport-ModuleMember -Function Get-AuthenticodeSignature\n");
            const setup = `$env:PSModulePath = '${directory.replace(/'/g, "''")}';`;
            const verify = "Get-AuthenticodeSignature -FilePath (Join-Path $PSHOME 'powershell.exe') -ErrorAction Stop | Out-Null";
            const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'AllSigned', '-Command'];
            await assert.rejects(runAzdInstallTask('powershell', [...args, `${setup} ${verify}`]));
            await runAzdInstallTask('powershell', [...args, `${setup} ${azdWindowsInstallPreamble} ${verify}`]);
        } finally {
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    test('reports a terminated installer', async function (this: Mocha.Context): Promise<void> {
        this.timeout(30000);
        const [executable, args] = process.platform === 'win32' ?
            ['cmd.exe', ['/d', '/c', 'ping -n 30 127.0.0.1 > nul']] :
            ['/bin/sh', ['-c', 'sleep 30']];
        const listener = vscode.tasks.onDidStartTaskProcess(event => {
            if (event.execution.task.definition.type === 'azureFunctionsAzdInstall') {
                event.execution.terminate();
            }
        });
        try {
            await assert.rejects(runAzdInstallTask(executable, args), /installation did not complete successfully/i);
        } finally {
            listener.dispose();
        }
    });
});
