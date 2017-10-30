/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigVariables } from './ConfigVariables';

interface IEnumValue {
    value: string;
    display: string;
}

export class EnumValue {
    private _enumValue: IEnumValue;
    private _variables: ConfigVariables;
    constructor(variables: ConfigVariables, data: object) {
        this._variables = variables;
        this._enumValue = <IEnumValue>data;
    }

    get value(): string {
        return this._variables.getValue(this._enumValue.value);
    }

    get displayName(): string {
        return this._variables.getValue(this._enumValue.display);
    }
}
