/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type ConnectorTriggerF5Dependencies } from './connectorTriggerF5Contracts';

export function createConnectorTriggerF5Dependencies(
    _context: IActionContext,
    _projectPath: string,
): Promise<ConnectorTriggerF5Dependencies | undefined> {
    return Promise.resolve(undefined);
}
