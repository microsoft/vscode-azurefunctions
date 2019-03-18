/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
    EventHub = 'EventHub',
    ServiceBus = 'ServiceBus'
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
    description?: string;
    name: string;
    validateSetting(value: string | undefined): string | undefined;
}
