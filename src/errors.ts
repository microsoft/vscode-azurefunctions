/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from './localize';

export class UserCancelledError extends Error { }

export class NoWorkspaceError extends Error {
    public message: string = localize('azFunc.noWorkspaceError', 'You must have a workspace open to perform this operation.');
}

export class ArgumentError extends Error {
    constructor(obj: object) {
        super(localize('azFunc.argumentError', 'Invalid {0}.', obj.constructor.name));
    }
}
