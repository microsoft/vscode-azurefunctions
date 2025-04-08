/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';
// import * as cp from 'child_process';
// import * as path from 'path';

// async function main(): Promise<void> {
//     try {
//         const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
//         const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

//         cp.spawnSync(
//             cli,
//             [
//                 ...args,
//                 '--install-extension', 'ms-vscode.azure-account',
//                 '--install-extension', 'ms-azuretools.vscode-azureresourcegroups',
//                 '--install-extension', 'ms-python.python',
//             ],
//             {
//                 encoding: 'utf-8',
//                 stdio: 'inherit'
//             });

//         const repoRoot: string = path.resolve(__dirname, '..', '..');
//         await runTests({
//             vscodeExecutablePath,
//             extensionDevelopmentPath: repoRoot,
//             launchArgs: [
//                 path.resolve(repoRoot, 'test', 'test.code-workspace'),
//                 '--disable-workspace-trust'
//             ],
//             extensionTestsPath: path.resolve(repoRoot, 'dist', 'test', 'index'),
//             extensionTestsEnv: {
//                 DEBUGTELEMETRY: 'v',
//                 MOCHA_timeout: '20000'
//             }
//         });
//     } catch (err) {
//         console.error('Failed to run tests');
//         process.exit(1);
//     }
// }

// TODO: Re-enable test after release
// void main();
