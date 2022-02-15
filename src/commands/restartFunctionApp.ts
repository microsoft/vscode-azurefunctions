/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';
import { startFunctionApp } from './startFunctionApp';
import { stopFunctionApp } from './stopFunctionApp';

export async function restartFunctionApp(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    node = await stopFunctionApp(context, node);
    await startFunctionApp(context, node);
}
