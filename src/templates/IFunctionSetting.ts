/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';

export enum ValueType {
    string = 'string',
    boolean = 'boolean',
    enum = 'enum',
    checkBoxList = 'checkBoxList',
    int = 'int'
}

export enum ResourceType {
    DocumentDB = 'DocumentDB',
    Storage = 'Storage',
    EventHub = 'EventHub'
}

export function getResourceTypeLabel(resourceType: ResourceType): string {
    switch (resourceType) {
        case ResourceType.DocumentDB:
            return localize('azFunc.DocumentDB', 'Cosmos DB Account');
        case ResourceType.Storage:
            return localize('azFunc.Storage', 'Storage Account');
        case ResourceType.EventHub:
            return localize('azFunc.EventHub', 'Event Hub');
        default:
            return resourceType;
    }
}

export interface IEnumValue {
    value: string;
    displayName: string;
}

/**
 * Describes a setting used when creating a function trigger (i.e. 'AuthorizationLevel' for an HttpTrigger or 'Schedule' for a TimerTrigger)
 */
export interface IFunctionSetting {
    resourceType: ResourceType | undefined;
    valueType: ValueType | undefined;
    defaultValue: string | undefined;
    enums: IEnumValue[];
    label: string;
    name: string;
    validateSetting(value: string | undefined): string | undefined;
}
