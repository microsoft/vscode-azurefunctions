/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';
import { startFunctionApp } from './startFunctionApp';
import { stopFunctionApp } from './stopFunctionApp';

export async function restartFunctionApp(node?: SlotTreeItemBase): Promise<void> {
    await stopFunctionApp(node);
    await startFunctionApp(node);
}
