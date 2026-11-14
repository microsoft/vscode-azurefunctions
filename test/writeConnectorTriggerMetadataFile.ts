/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type ConnectorTriggerProjectMetadata } from '../src/connectorTrigger/connectorTriggerProjectMetadata';

export async function writeConnectorTriggerMetadataFile(projectPath: string, metadata: ConnectorTriggerProjectMetadata): Promise<void> {
    await AzExtFsExtra.writeJSON(path.join(projectPath, '.vscode', 'azureFunctions.connectorTrigger.json'), metadata);
}
