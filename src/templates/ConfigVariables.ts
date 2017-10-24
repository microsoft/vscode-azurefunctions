/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Resources } from './Resources';

export class ConfigVariables {
    private _variables: { [name: string]: string };
    private _resources: Resources;
    constructor(variables: { [name: string]: string }, resources: Resources) {
        this._variables = variables;
        this._resources = resources;
    }

    public getValue(data: string): string {
        const matches: RegExpMatchArray | null = data.match(/\[variables\(\'(.*)\'\)\]/);
        data = matches !== null ? this._variables[matches[1]] : data;

        return this._resources.getValue(data);
    }
}
