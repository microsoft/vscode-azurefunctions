/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as opn from 'opn';
import { INode } from './nodes';

export class AzureFunctionsCommands {
    public static openInPortal(node?: INode) {
        if (node && node.tenantId) {
            opn(`https://portal.azure.com/${node.tenantId}/#resource${node.id}`);
        }
    }
}