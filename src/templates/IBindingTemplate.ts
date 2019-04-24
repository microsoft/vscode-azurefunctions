/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Describes a template used for creating a binding
 */
export interface IBindingTemplate {
    // tslint:disable-next-line: no-reserved-keywords
    type: string;
    direction: string;
    displayName: string;
    settings: IBindingSetting[];
}

/**
 * Describes a setting used when creating a binding (i.e. 'AuthorizationLevel' for an HttpTrigger or 'Schedule' for a TimerTrigger)
 */
export interface IBindingSetting {
    resourceType: ResourceType | undefined;
    valueType: ValueType | undefined;
    defaultValue: string | undefined;
    required: boolean | undefined;
    enums: IEnumValue[];
    label: string;
    description?: string;
    name: string;
    validateSetting(value: string | undefined): string | undefined;
}

export enum ResourceType {
    DocumentDB = 'DocumentDB',
    Storage = 'Storage',
    EventHub = 'EventHub',
    ServiceBus = 'ServiceBus'
}

export enum ValueType {
    string = 'string',
    boolean = 'boolean',
    enum = 'enum',
    checkBoxList = 'checkBoxList',
    int = 'int'
}

export interface IEnumValue {
    value: string;
    displayName: string;
}
