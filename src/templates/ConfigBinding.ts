/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigSetting } from './ConfigSetting';
import { ConfigVariables } from './ConfigVariables';

interface IBinding {
    // tslint:disable-next-line:no-reserved-keywords
    type: string;
    settings: object[];
}

export class ConfigBinding {
    public bindingType: string;
    public settings: ConfigSetting[];
    constructor(variables: ConfigVariables, data: object) {
        const binding: IBinding = <IBinding>data;
        this.bindingType = binding.type;
        this.settings = binding.settings.map((s: object) => new ConfigSetting(variables, s));
    }
}
