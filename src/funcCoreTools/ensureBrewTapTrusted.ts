/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';

const funcTap: string = 'azure/functions';

/**
 * Prompts the user to trust the "azure/functions" Homebrew tap, then taps and trusts it.
 *
 * Both install and update flows require this: we can't assume a previously installed package was
 * ever tapped/trusted (e.g. it may predate this logic), so we establish trust before every brew
 * install/update. The `tap`/`trust` commands are idempotent, so running them again is a no-op.
 */
export async function ensureBrewTapTrusted(context: IActionContext): Promise<void> {
    const trust: vscode.MessageItem = { title: localize('trustTap', 'Trust') };
    const trustMessage: string = localize('trustBrewTap', `Installing the Azure Functions Core Tools requires tapping the "${funcTap}" Homebrew repository. Only continue if you trust the maintainers of "${funcTap}".`);
    await context.ui.showWarningMessage(trustMessage, { modal: true }, trust);
    await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', composeArgs(withArg('tap', funcTap))());
    await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'brew', composeArgs(withArg('trust', funcTap))());
}
