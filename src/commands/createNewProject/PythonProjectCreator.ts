/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gt } from 'semver';
import { TemplateFilter } from "../../constants";
import { localize } from "../../localize";
import { cpUtils } from "../../utils/cpUtils";
import { funcHostTaskId } from "./IProjectCreator";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export class PythonProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToJavaScriptFunc', 'Attach to JavaScript Functions'),
                    type: 'node',
                    request: 'attach',
                    port: 5858,
                    protocol: 'inspector',
                    preLaunchTask: funcHostTaskId
                }
            ]
        };
    }

    private async validatePythonVersion3(): Promise<boolean> {
        const minReqVersion: string = '3.6.0';
        const pyVersion: string = await cpUtils.executeCommand(this.outputChannel, undefined /*default to cwd*/, 'py --version');
        return gt(pyVersion, minReqVersion);
    }

    private async activeVirtualEnvironment(): Promise<boolean> {

    }

    private async createVirtualEnviornment(): Promise<void> {

    }
}
