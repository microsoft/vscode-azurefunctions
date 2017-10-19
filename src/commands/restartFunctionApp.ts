/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { FunctionAppNode } from '../nodes/FunctionAppNode';
import { startFunctionApp } from './startFunctionApp';
import { stopFunctionApp } from './stopFunctionApp';

export async function restartFunctionApp(explorer: AzureFunctionsExplorer, node?: FunctionAppNode): Promise<void> {
    await stopFunctionApp(explorer, node);
    await startFunctionApp(explorer, node);
}
