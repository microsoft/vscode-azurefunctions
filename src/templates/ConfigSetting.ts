/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigValidator } from './ConfigValidator';
import { ConfigVariables } from './ConfigVariables';

export enum ValueType {
    string = 'string',
    boolean = 'boolean',
    enum = 'enum',
    checkBoxList = 'checkBoxList'
}

export enum ResourceType {
    DocumentDB = 'DocumentDB'
}

interface IBindingSetting {
    name: string;
    value: ValueType;
    label: string;
    defaultValue?: string;
    required: boolean;
    resource?: ResourceType;
    validators?: object[];
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
