/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigBinding } from './ConfigBinding';
import { ConfigVariables } from './ConfigVariables';
import { Resources } from './Resources';

interface IConfig {
    variables: { [name: string]: string };
    bindings: object[];
}

export class Config {
    public bindings: ConfigBinding[];
    constructor(data: object, resources: Resources) {
        const config: IConfig = <IConfig>data;
        const variables: ConfigVariables = new ConfigVariables(config.variables, resources);
        this.bindings = config.bindings.map((b: object) => new ConfigBinding(variables, b));
    }
}
