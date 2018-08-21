/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pathExists } from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';
import { MessageItem, OpenDialogOptions, workspace } from 'vscode';
import { localSettingsFileName, TemplateFilter } from "../../constants";
import { ext } from '../../extensionVariables';
import { ILocalAppSettings } from '../../LocalAppSettings';
import { localize } from "../../localize";
import { getFuncExtensionSetting, updateWorkspaceSetting } from '../../ProjectSettings';
import { cpUtils } from "../../utils/cpUtils";
import * as fsUtil from '../../utils/fs';
import { funcHostTaskId } from "./IProjectCreator";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export class PythonProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    private readonly pythonVenvPathSetting: string = 'python.venvRelativePath';
    private pythonAlias: string;
    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToJavaScriptFunc', 'Attach to Python Functions'),
                    type: 'python',
                    request: 'attach',
                    port: 9091,
                    host: 'localhost',
                    preLaunchTask: funcHostTaskId
                }
            ]
        };
    }

    public async addNonVSCodeFiles(): Promise<void> {
        if (await this.validatePythonVersion()) {
            await this.ensureVirtualEnviornment();
        } else {
            throw new Error('Python 3.6 is required to create a Python Function project.');
        }
    }

    public async getTasksJson(): Promise<{}> {
        const venvActivatePath: string = await this.getVenvActivatePath();
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: 'create',
                    command: `${venvActivatePath} | func init ./ --worker-runtime ${this.pythonAlias}`,
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
                    command: `${venvActivatePath} | func host start`,
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    options: {
                        env: {
                            // tslint:disable-next-line:no-invalid-template-strings
                            'languageWorkers:python:arguments': '-m ptvsd --server --port 9091 --file'
                        }
                    },
                    problemMatcher: []
                }
            ]
        };
    }

    private async validatePythonVersion(): Promise<boolean> {
        const minReqVersion: string = '3.6.0';
        try {
            const pyVersion: string = (await cpUtils.executeCommand(ext.outputChannel, undefined /*default to cwd*/, 'python3 --version')).substring('Python '.length);
            this.pythonAlias = 'python3';
            return semver.gt(pyVersion, minReqVersion);
        } catch {
            // ignore and try next alias
        }
        try {
            const pyVersion: string = (await cpUtils.executeCommand(ext.outputChannel, undefined /*default to cwd*/, 'python --version')).substring('Python '.length);
            this.pythonAlias = 'python';
            return semver.gt(pyVersion, minReqVersion);
        } catch {
            return false;
        }

    }

    private async ensureVirtualEnviornment(): Promise<void> {
        const funcEnv: string = 'func_env';
        let pythonVenvPath: string;
        const venvRequired: string = localize('venvRequired', 'You must be running in a virtual environment to create a Python Function project. Would you like to create a new one or use an existing?');
        const input: MessageItem = await ext.ui.showWarningMessage(venvRequired, { modal: true }, { title: 'Create' }, { title: 'Existing' });
        if (input.title === 'Create') {
            if (!(await pathExists(path.join(this.functionAppPath, funcEnv)))) {
                // if there is no func_env, create one as it's required for Python functions
                await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, this.pythonAlias, '-m', 'venv', 'func_env');
            }
            pythonVenvPath = funcEnv;
        } else {
            const options: OpenDialogOptions = {
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: workspace.workspaceFolders && workspace.workspaceFolders.length > 0 ? workspace.workspaceFolders[0].uri : undefined,
                openLabel: localize('select', 'Select')
            };
            const venvFspath: string = (await ext.ui.showOpenDialog(options))[0].fsPath;
            pythonVenvPath = path.relative(this.functionAppPath, venvFspath);
        }
        await updateWorkspaceSetting(this.pythonVenvPathSetting, pythonVenvPath, this.functionAppPath);
    }

    private async getVenvActivatePath(): Promise<string> {
        const venvPath: string | undefined = getFuncExtensionSetting(this.pythonVenvPathSetting, this.functionAppPath);
        if (venvPath) {
            return path.join('.', venvPath, 'Scripts', 'activate');
        } else {
            await this.ensureVirtualEnviornment();
            return await this.getVenvActivatePath();
        }
    }
}
