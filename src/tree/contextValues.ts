/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum AppSource {
    remote = 'remote',
    local = 'local'
}

export enum AppPerms {
    readWrite = 'readWrite',
    readOnly = 'readOnly'
}

export enum FunctionState {
    enabled = 'enabled',
    disabled = 'disabled'
}

export enum TriggerType {
    http = 'http',
    timer = 'timer',
    unknown = 'unknown'
}
