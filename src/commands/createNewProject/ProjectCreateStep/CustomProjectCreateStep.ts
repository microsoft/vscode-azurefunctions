/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHostJsonV2 } from '../../../funcConfig/host';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

export class CustomProjectCreateStep extends ScriptProjectCreateStep {
    protected async getHostContent(): Promise<IHostJsonV2> {
        const hostJson: IHostJsonV2 = await super.getHostContent();
        hostJson.customHandler = {
            description: {
                defaultExecutablePath: '',
                workingDirectory: '',
                arguments: []
            }
        };
        return hostJson;
    }
}
