/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Uri } from "vscode";
import { localSettingsFileName } from '../../constants';
import { ext } from "../../extensionVariables";
import { localize } from '../../localize';
import { cpUtils } from "../../utils/cpUtils";
import * as workspaceUtil from '../../utils/workspace';

export async function encryptLocalSettings(uri?: Uri): Promise<void> {
    const localSettingsPath: string = uri ? uri.fsPath : await workspaceUtil.selectWorkspaceFile(ext.ui, localize('selectLocalSettings', 'Select the settings file to encrypt.'), () => localSettingsFileName);
    ext.outputChannel.show(true);
    await cpUtils.executeCommand(ext.outputChannel, path.dirname(localSettingsPath), 'func', 'settings', 'encrypt');
}
