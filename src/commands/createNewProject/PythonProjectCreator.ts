/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pathExists } from 'fs-extra';
import { join } from 'path';
import { gt } from 'semver';
import { TemplateFilter } from "../../constants";
import { ext } from '../../extensionVariables';
import { localize } from "../../localize";
import { cpUtils } from "../../utils/cpUtils";
import { funcHostTaskId } from "./IProjectCreator";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export class PythonProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    private readonly cliActivateVenv: string = join('.', 'func_env', 'Scripts', 'activate');
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

    public async addNonVSCodeFiles(): Promise<void> {
        if (await this.validatePythonVersion()) {
            await this.ensureVirtualEnviornment();
        } else {
            throw new Error('Cannot create Python projects without a Python version that is < 3.6.0.');
        }
    }

    public getTasksJson(): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: 'create',
                    command: `${this.cliActivateVenv} | func init ./ --worker-runtime python`,
                    type: 'shell',
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: '$msCompile'
                },
                {
                    label: localize('azFunc.runFuncHost', 'Run Functions Host'),
                    identifier: funcHostTaskId,
                    type: 'shell',
                    dependsOn: 'build',
                    command: `${this.cliActivateVenv} | func host start`,
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: []
                }
            ]
        };
    }

    private async validatePythonVersion(): Promise<boolean> {
        const minReqVersion: string = '3.6.0';
        const pyVersion: string = (await cpUtils.executeCommand(ext.outputChannel, undefined /*default to cwd*/, 'python --version')).substring('Python '.length);
        return gt(pyVersion, minReqVersion);
    }

    private async ensureVirtualEnviornment(): Promise<void> {
        const funcEnv: string = 'func_env';
        if (!(await pathExists(join(this.functionAppPath, funcEnv)))) {
            // if there is no func_env, create one as it's required for Python functions
            await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, 'python', '-m', 'venv', 'func_env');
        }
    }
}
