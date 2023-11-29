/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type BindingSettingValue } from "../funcConfig/function";

/**
 * Describes a template used for creating a binding
 */
export interface IBindingTemplate {
    type: string;
    direction: string;
    displayName: string;
    isHttpTrigger: boolean;
    isTimerTrigger: boolean;
    settings: IBindingSetting[];
}

/**
 * Describes a setting used when creating a binding (i.e. 'AuthorizationLevel' for an HttpTrigger or 'Schedule' for a TimerTrigger)
 */
export interface IBindingSetting {
    resourceType: ResourceType | undefined;
    valueType: ValueType | undefined;
    defaultValue: BindingSettingValue;
    required: boolean | undefined;
    enums: IEnumValue[];
    label: string;
    description?: string;
    name: string;
    validateSetting(value: string | undefined): string | undefined;
    // used by the new V2 schema as token to replace in content
    assignTo?: string;
}

export enum ResourceType {
    DocumentDB = 'DocumentDB',
    Storage = 'Storage',
    EventHub = 'EventHub',
    ServiceBus = 'ServiceBus',
    ExistingFile = 'Existingfile',
    NewFile = 'Newfile'
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
