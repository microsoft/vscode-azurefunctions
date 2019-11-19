/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Has extra logic to remove a BOM character if it exists
 */
export function parseJson<T extends object>(data: string): T {
    if (data.charCodeAt(0) === 0xFEFF) {
        data = data.slice(1);
    }
    return <T>JSON.parse(data);
}
