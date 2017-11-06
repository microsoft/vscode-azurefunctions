/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';
import { ConfigValidator } from './ConfigValidator';
import { ConfigVariables } from './ConfigVariables';
import { EnumValue } from './EnumValue';

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

interface IBindingSetting {
    name: string;
    value: ValueType;
    label: string;
    defaultValue?: string;
    required: boolean;
    resource?: ResourceType;
    validators?: object[];
    // tslint:disable-next-line:no-reserved-keywords
    enum?: object[];
}

export class ConfigSetting {
    private _setting: IBindingSetting;
    private _variables: ConfigVariables;
    constructor(variables: ConfigVariables, data: object) {
        this._variables = variables;
        this._setting = <IBindingSetting>data;
    }

    public get resourceType(): ResourceType | undefined {
        return this._setting.resource;
    }

    public get valueType(): ValueType | undefined {
        return this._setting.value;
    }

    public get defaultValue(): string | undefined {
        return this._setting.defaultValue ? this._variables.getValue(this._setting.defaultValue) : undefined;
    }

    public get label(): string {
        return this._variables.getValue(this._setting.label);
    }

    public get name(): string {
        return this._variables.getValue(this._setting.name);
    }

    public get enums(): EnumValue[] {
        return this._setting.enum ? this._setting.enum.map((ev: object) => new EnumValue(this._variables, ev)) : [];
    }

    public validateSetting(value: string | undefined): string | undefined {
        if (this._setting.validators) {
            const validators: ConfigValidator[] = this._setting.validators.map((v: object) => new ConfigValidator(this._variables, v));
            for (const validator of validators) {
                if (!value || value.match(validator.expression) === null) {
                    return validator.errorText;
                }
            }
        }

        return undefined;
    }
}
