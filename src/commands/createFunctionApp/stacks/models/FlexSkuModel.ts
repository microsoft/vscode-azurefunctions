/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Sku {
    skuCode: string;
    instanceMemoryMB: InstanceMemoryMB[];
    maximumInstanceCount: MaximumInstanceCount,
    functionAppConfigProperties: {
        runtime: {
            name: string,
            version: string
        }
    }
}

interface InstanceMemoryMB {
    size: string;
    isDefault: boolean;
}

interface MaximumInstanceCount {
    lowestMaximumInstanceCount: number;
    highestMaximumInstanceCount: number;
    defaultValue: number;
}
