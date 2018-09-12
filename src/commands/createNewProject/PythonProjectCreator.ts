/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { MessageItem } from 'vscode';
import { DialogResponses, UserCancelledError } from 'vscode-azureextensionui';
import { funcPackId, gitignoreFileName, Platform, TemplateFilter } from "../../constants";
import { ext } from '../../extensionVariables';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from "../../localize";
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
    public preDeployTask: string = funcPackId;
    private pythonAlias: string;
    private funcEnv: string = 'func_env';
    private installPtvsd: string = 'pip install ptvsd';
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
        await this.createVirtualEnviornment();
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
                        command: `source ${await this.getVenvActivatePath(Platform.Linux)} && func start host`
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
                },

                {
                    label: funcPackId,
                    identifier: funcPackId, // Until this is fixed, the label must be the same as the id: https://github.com/Microsoft/vscode/issues/57707
                    type: 'shell',
                    osx: {
                        command: `source ${await this.getVenvActivatePath(Platform.MacOS)} && func pack`
                    },
                    windows: {
                        command: `${await this.getVenvActivatePath(Platform.Windows)} | func pack`
                    },
                    linux: {
                        command: `source ${await this.getVenvActivatePath(Platform.Linux)} && func pack`
                    },
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    }
                }
            ]
        };
    }

    public getRecommendedExtensions(): string[] {
        return super.getRecommendedExtensions().concat(['ms-python.python']);
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
            const pyVersion: string = (await cpUtils.executeCommand(undefined /*don't display output*/, undefined /*default to cwd*/, `${pyAlias} --version`)).substring('Python '.length);
            if (semver.gte(pyVersion, minReqVersion)) {
                this.pythonAlias = pyAlias;
            }
        } catch {
            // ignore error, not installed under this alias
        }
    }

    private async createVirtualEnviornment(): Promise<void> {
        if (await fse.pathExists(path.join(this.functionAppPath, this.funcEnv))) {
            const input: MessageItem = await ext.ui.showWarningMessage(localize('funcEnvExists', 'Python Virtual Environment already exists.  Overwrite?', this.funcEnv), { modal: true }, DialogResponses.yes, DialogResponses.no, DialogResponses.cancel);
            if (input === DialogResponses.no) {
                return;
            }
        }
        await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, this.pythonAlias, '-m', 'venv', this.funcEnv);
        if (process.platform === Platform.Windows) {
            await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, `${await this.getVenvActivatePath(Platform.Windows)} && ${this.installPtvsd}`);
        } else {
            await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, `source ${await this.getVenvActivatePath(Platform.MacOS)} && ${this.installPtvsd}`);
        }
    }

    private async getVenvActivatePath(platform: Platform): Promise<string> {
        switch (platform) {
            case Platform.Windows:
                return path.join('.', this.funcEnv, 'Scripts', 'activate');
            case Platform.MacOS:
            default:
                return path.join('.', this.funcEnv, 'bin', 'activate');
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
                await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, `source ${await this.getVenvActivatePath(Platform.MacOS)} && ${funcInitPython}`);
                break;
        }
        // .gitignore is created by `func init`
        const gitignorePath: string = path.join(this.functionAppPath, gitignoreFileName);
        if (await fse.pathExists(gitignorePath)) {
            const pythonPackages: string = 'python_packages';
            let writeFile: boolean = false;
            let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();
            // the func_env and ._python_packages are recreated and should not be checked in
            if (!gitignoreContents.includes(this.funcEnv)) {
                ext.outputChannel.appendLine(localize('gitAddFunc_Env', 'Adding "{0}" to .gitignore...', this.funcEnv));
                gitignoreContents = gitignoreContents.concat(`${os.EOL}${this.funcEnv}`);
                writeFile = true;
            }
            if (!gitignoreContents.includes(pythonPackages)) {
                ext.outputChannel.appendLine(localize('gitAddFunc_Env', 'Adding "{0}" to .gitignore...', pythonPackages));
                gitignoreContents = gitignoreContents.concat(`${os.EOL}${pythonPackages}`);
                writeFile = true;
            }

            if (writeFile) {
                await fse.writeFile(gitignorePath, gitignoreContents);
            }
        }
    }
}
