/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from './localize';

// tslint:disable:max-classes-per-file

export class NoWorkspaceError extends Error {
    public message: string = localize('azFunc.noWorkspaceError', 'You must have a workspace open to perform this operation.');
}

export class ArgumentError extends Error {
    constructor(obj: object) {
        super(localize('azFunc.argumentError', 'Invalid {0}.', obj.constructor.name));
    }
}

export class NoSubscriptionError extends Error {
    public message: string = localize('azFunc.noSubscriptionError', 'You must be signed in to Azure to perform this operation.');
}

export class NoPackagedJavaFunctionError extends Error {
    public message: string = localize('azFunc.noPackagedJavaFunctionError', 'Cannot find packaged Java functions.');
}

// tslint:disable-next-line:max-classes-per-file
export class XmlParseError extends Error { }
