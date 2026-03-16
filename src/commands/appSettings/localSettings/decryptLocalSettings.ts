/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as path from 'path';
import { type Uri } from "vscode";
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { cpUtils } from '../../../utils/cpUtils';
import { getLocalSettingsFile } from './getLocalSettingsFile';

export async function decryptLocalSettings(context: IActionContext, uri?: Uri): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select the settings file to decrypt.');
    const localSettingsPath: string = uri ? uri.fsPath : await getLocalSettingsFile(context, message);
    ext.outputChannel.show(true);
    await cpUtils.executeCommand(ext.outputChannel, path.dirname(localSettingsPath), 'func', composeArgs(withArg('settings', 'decrypt'))());
}
