/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigVariables } from './ConfigVariables';

interface IConfigValidator {
    expression: string;
    errorText: string;
}

export class ConfigValidator {
    private _validator: IConfigValidator;
    private _variables: ConfigVariables;
    constructor(variables: ConfigVariables, data: object) {
        this._variables = variables;
        this._validator = <IConfigValidator>data;
    }

    public get expression(): string {
        return this._validator.expression;
    }

    public get errorText(): string | undefined {
        return this._variables.getValue(this._validator.errorText);
    }
}
