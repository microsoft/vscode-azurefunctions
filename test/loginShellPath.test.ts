/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { appendMissingPathEntries, getLoginShellPathForCommandCore, parseLoginShellPathOutput } from '../src/utils/loginShellPath';

suite('loginShellPath', () => {
    const minimalPath = '/usr/bin:/bin:/usr/sbin:/sbin';
    const shellPath = '/opt/homebrew/bin:/usr/bin:/bin:/Users/test/.nvm/versions/node/v22.0.0/bin';
    const commandExists = (dirs: string[]) => async (_command: string, searchPath: string): Promise<boolean> =>
        searchPath.split(':').some(d => dirs.includes(d));

    test('Appends login shell PATH entries missing from a minimal macOS PATH', async () => {
        let shellCalls = 0;
        const result = await getLoginShellPathForCommandCore('npm', minimalPath, 'darwin', async () => { shellCalls += 1; return shellPath; }, commandExists(['/opt/homebrew/bin']));
        assert.strictEqual(result, '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/Users/test/.nvm/versions/node/v22.0.0/bin');
        assert.strictEqual(shellCalls, 1);
    });

    test('Leaves the PATH unchanged when the command already resolves', async () => {
        let shellCalls = 0;
        const result = await getLoginShellPathForCommandCore('npm', shellPath, 'darwin', async () => { shellCalls += 1; return shellPath; }, commandExists(['/opt/homebrew/bin']));
        assert.strictEqual(result, undefined);
        assert.strictEqual(shellCalls, 0);
    });

    test('Leaves the PATH unchanged on Windows and for path-qualified commands', async () => {
        const getShellPath = async () => { throw new Error('Should not resolve the login shell'); };
        assert.strictEqual(await getLoginShellPathForCommandCore('npm', minimalPath, 'win32', getShellPath, commandExists([])), undefined);
        assert.strictEqual(await getLoginShellPathForCommandCore('/opt/homebrew/bin/func', minimalPath, 'darwin', getShellPath, commandExists([])), undefined);
        assert.strictEqual(await getLoginShellPathForCommandCore('.venv/bin/python', minimalPath, 'linux', getShellPath, commandExists([])), undefined);
    });

    test('Leaves the PATH unchanged when the login shell is unavailable or does not help', async () => {
        assert.strictEqual(await getLoginShellPathForCommandCore('npm', minimalPath, 'darwin', async () => undefined, commandExists(['/opt/homebrew/bin'])), undefined);
        assert.strictEqual(await getLoginShellPathForCommandCore('func', minimalPath, 'darwin', async () => shellPath, commandExists([])), undefined);
    });

    test('Uses the login shell PATH when the inherited PATH is empty', async () => {
        assert.strictEqual(await getLoginShellPathForCommandCore('func', undefined, 'linux', async () => '/usr/local/bin:/usr/bin', commandExists(['/usr/local/bin'])), '/usr/local/bin:/usr/bin');
    });

    test('Merges PATH entries without duplicates or empty entries', () => {
        assert.strictEqual(appendMissingPathEntries('/usr/bin::/bin', '/bin:/opt/homebrew/bin::/usr/bin'), '/usr/bin:/bin:/opt/homebrew/bin');
    });

    test('Parses PATH between markers and ignores shell startup output', () => {
        const output = 'Welcome!\n__AZURE_FUNCTIONS_LOGIN_PATH_START__\n/opt/homebrew/bin:/usr/bin\n__AZURE_FUNCTIONS_LOGIN_PATH_END__\nbye\n';
        assert.strictEqual(parseLoginShellPathOutput(output), '/opt/homebrew/bin:/usr/bin');
        assert.strictEqual(parseLoginShellPathOutput('no markers'), undefined);
        assert.strictEqual(parseLoginShellPathOutput('__AZURE_FUNCTIONS_LOGIN_PATH_START__\n\n__AZURE_FUNCTIONS_LOGIN_PATH_END__'), undefined);
    });
});
