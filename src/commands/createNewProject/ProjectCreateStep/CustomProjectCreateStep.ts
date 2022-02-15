/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { IHostJsonV2 } from '../../../funcConfig/host';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

export class CustomProjectCreateStep extends ScriptProjectCreateStep {
    protected async getHostContent(context: IActionContext): Promise<IHostJsonV2> {
        const hostJson: IHostJsonV2 = await super.getHostContent(context);
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
