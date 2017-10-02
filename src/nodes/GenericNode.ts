/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { INode } from './INode';

export class GenericNode implements INode {
    public readonly contextValue: string;
    public readonly command: vscode.Command;
    public readonly id: string;
    public readonly label: string;

    constructor(id: string, label: string, commandId?: string) {
        this.id = id;
        this.label = label;
        this.contextValue = id;
        if (commandId) {
            this.command = {
                command: commandId,
                title: ''
            };
        }
    }
}
