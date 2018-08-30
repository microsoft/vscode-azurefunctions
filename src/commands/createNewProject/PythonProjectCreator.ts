/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as semver from 'semver';
import { MessageItem, OpenDialogOptions, workspace } from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { Platform, TemplateFilter } from "../../constants";
import { ext } from '../../extensionVariables';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from "../../localize";
import { getFuncExtensionSetting, updateWorkspaceSetting } from '../../ProjectSettings';
import { cpUtils } from "../../utils/cpUtils";
import { funcHostProblemMatcher, funcHostTaskId } from "./IProjectCreator";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export enum PythonAlias {
    python = 'python',
    python3 = 'python3',
    py = 'py'
}

export class PythonProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    private readonly pythonVenvPathSetting: string = 'python.venvRelativePath';
    private pythonAlias: string;
    public getLaunchJson(): {} {
        // https://github.com/Microsoft/vscode-azurefunctions/issues/543
        const launchType: string = process.platform === Platform.Windows ? 'python' : 'pythonExperimental';
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToJavaScriptFunc', 'Attach to Python Functions'),
                    type: launchType,
                    request: 'attach',
                    port: 9091,
                    host: 'localhost',
                    preLaunchTask: funcHostTaskId
                }
            ]
        };
    }

    public async addNonVSCodeFiles(): Promise<void> {
        const funcCoreRequired: string = localize('funcCoreRequired', 'Azure Functions Core Tools must be installed to create, debug, and deploy local Python Functions projects.');
        if (!await validateFuncCoreToolsInstalled(true /* forcePrompt */, funcCoreRequired)) {
            throw new UserCancelledError();
        }
        await this.validatePythonVersion();
        await this.setVirtualEnviornment();
        await this.createPythonProject();
    }

    public async getTasksJson(): Promise<{}> {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: localize('azFunc.runFuncHost', 'Run Functions Host'),
                    identifier: funcHostTaskId,
                    type: 'shell',
                    dependsOn: 'build',
                    osx: {
                        command: `source ${await this.getVenvActivatePath(Platform.MacOS)} && func start host`
                    },
                    windows: {
                        command: `${await this.getVenvActivatePath(Platform.Windows)} | func start host`
                    },
                    linux: {
                        command: `source ${await this.getVenvActivatePath(Platform.MacOS)} && func start host`
                    },
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
                    problemMatcher: [
                        funcHostProblemMatcher
                    ]
                }
            ]
        };
    }

    private async validatePythonVersion(): Promise<void> {
        const minReqVersion: string = '3.6.0';
        await this.tryGetPythonAlias(PythonAlias.py, minReqVersion);
        await this.tryGetPythonAlias(PythonAlias.python, minReqVersion);
        await this.tryGetPythonAlias(PythonAlias.python3, minReqVersion);
        if (!this.pythonAlias) {
            throw new Error(localize('pythonVersionRequired', 'Python {0} is required to create a Python Function project with Azure Functions Core Tools.', minReqVersion));
        }
    }

    private async tryGetPythonAlias(pyAlias: PythonAlias, minReqVersion: string): Promise<void> {
        try {
            const pyVersion: string = (await cpUtils.executeCommand(ext.outputChannel, undefined /*default to cwd*/, `${pyAlias} --version`)).substring('Python '.length);
            if (semver.gte(pyVersion, minReqVersion)) {
                this.pythonAlias = pyAlias;
            }
        } catch {
            // ignore error, not installed under this alias
        }
    }

    private async setVirtualEnviornment(): Promise<void> {
        const funcEnv: string = 'func_env';
        let pythonVenvPath: string;
        const newButton: MessageItem = { title: 'Create New' };
        const existingButton: MessageItem = { title: 'Use Existing' };
        const venvRequired: string = localize('venvRequired', 'You must be running in a Python virtual environment to create a Python Function project. Create a new one or use an existing?');
        const input: MessageItem = await ext.ui.showWarningMessage(venvRequired, { modal: true }, newButton, existingButton);
        if (input === newButton) {
            // if there is no func_env, create one as it's required for Python functions
            await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, this.pythonAlias, '-m', 'venv', 'func_env');
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

    private async getVenvActivatePath(platform: Platform): Promise<string> {
        const venvPath: string | undefined = getFuncExtensionSetting(this.pythonVenvPathSetting, this.functionAppPath);
        if (venvPath) {
            switch (platform) {
                case Platform.Windows:
                    return path.join('.', venvPath, 'Scripts', 'activate');
                case Platform.MacOS:
                default:
                    return path.join('.', venvPath, 'bin', 'activate');
            }

        } else {
            // if there is no venv path, prompt user and recursively call function again
            await this.setVirtualEnviornment();
            return await this.getVenvActivatePath(platform);
        }
    }

    private async createPythonProject(): Promise<void> {
        const funcInitPython: string = 'func init ./ --worker-runtime python';
        switch (process.platform) {
            case Platform.Windows:
                await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, `${await this.getVenvActivatePath(Platform.Windows)} && ${funcInitPython}`);
                break;
            case Platform.MacOS:
            default:
                // assuming OSX and Linux use the same path -- need to some testing
                await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, `source ${await this.getVenvActivatePath(Platform.MacOS)} && ${funcInitPython}`);
                break;
        }
    }
}
