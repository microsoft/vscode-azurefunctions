/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITasksJson {
    tasks: ITask[];
}

export interface ITask {
    label: string;
    options?: ITaskOptions;
}

export interface ITaskOptions {
    env?: {
        [key: string]: string;
    };
}
