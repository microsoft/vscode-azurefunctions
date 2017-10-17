/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from './localize';

export class ErrorData {
    public readonly message: string;
    public readonly errorType: string;
    // tslint:disable-next-line:no-any
    constructor(error: any) {
        if (error instanceof Error) {
            this.errorType = error.constructor.name;
            this.message = error.message;
        } else if (typeof (error) === 'object' && error !== null) {
            this.errorType = (<object>error).constructor.name;
            this.message = JSON.stringify(error);
            // tslint:disable-next-line:no-unsafe-any
        } else if (error !== undefined && error !== null && error.toString && error.toString().trim() !== '') {
            this.errorType = typeof (error);
            // tslint:disable-next-line:no-unsafe-any
            this.message = error.toString();
        } else {
            this.errorType = typeof (error);
            this.message = localize('azFunc.unknownError', 'Unknown Error');
        }
    }
}
