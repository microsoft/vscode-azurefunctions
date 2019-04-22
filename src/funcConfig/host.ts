/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IHostJson {
    version?: string;
    managedDependency?: {
        enabled?: boolean;
    };
    extensionBundle?: {
        id?: string;
        version?: string;
    };
}
