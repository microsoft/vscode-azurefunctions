/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { composeArgs, withQuotedArg } from '@microsoft/vscode-processutils';
import { cpUtils } from '../../utils/cpUtils';

export async function cloneProjectTemplate(repositoryUrl: string, gitRef: string, destination: string, folderPath?: string): Promise<void> {
    const pinnedCommit = /^[a-f\d]{40}$/i.test(gitRef);
    const sparse = !!folderPath && folderPath !== '.';
    const args = ['clone', '--depth', '1'];
    if (pinnedCommit || sparse) {
        args.push('--filter=blob:none', '--no-checkout');
    }
    if (sparse) {
        args.push('--sparse');
    }
    if (!pinnedCommit) {
        args.push('--branch', gitRef.replace(/^refs\/(?:heads|tags)\//, ''));
    }
    args.push(repositoryUrl, destination);
    await cpUtils.executeCommand(undefined, undefined, 'git', composeArgs(withQuotedArg(...args))());
    if (pinnedCommit) {
        await cpUtils.executeCommand(undefined, destination, 'git', composeArgs(withQuotedArg('fetch', '--depth', '1', 'origin', gitRef))());
    }
    if (sparse) {
        await cpUtils.executeCommand(undefined, destination, 'git', composeArgs(withQuotedArg('sparse-checkout', 'set', '--', folderPath))());
    }
    if (pinnedCommit || sparse) {
        await cpUtils.executeCommand(undefined, destination, 'git', composeArgs(withQuotedArg('checkout', ...(pinnedCommit ? ['--detach', 'FETCH_HEAD'] : [])))());
    }
}
