/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace envUtils {
    export function isEnvironmentVariableSet(val: string | undefined): boolean {
        // tslint:disable-next-line: strict-boolean-expressions
        return !/^(false|0)?$/i.test(val || '');
    }
}
