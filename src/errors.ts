/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from './localize';

export class NoWorkspaceError extends Error {
    public message: string = localize('noWorkspaceError', 'You must have a workspace open to perform this operation.');
}

export class NotImplementedError extends Error {
    constructor(methodName: string, obj: object) {
        super(`Internal Error: "${methodName}" is not implemented on "${obj.constructor.name}".`);
    }
}
