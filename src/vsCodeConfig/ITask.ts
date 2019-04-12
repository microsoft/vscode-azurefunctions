/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition } from "vscode";

export interface ITask extends TaskDefinition {
    label?: string;
    options?: ITaskOptions;
}

export interface ITaskOptions {
    cwd?: string;
    env?: {
        [key: string]: string;
    };
}
