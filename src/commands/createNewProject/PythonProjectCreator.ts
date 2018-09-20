/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { MessageItem, window } from 'vscode';
import { DialogResponses, parseError, UserCancelledError } from 'vscode-azureextensionui';
import { funcPackId, gitignoreFileName, isWindows, localSettingsFileName, Platform, TemplateFilter } from "../../constants";
import { ext } from '../../extensionVariables';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { azureWebJobsStorageKey, getLocalSettings, ILocalAppSettings } from '../../LocalAppSettings';
import { localize } from "../../localize";
import { cpUtils } from "../../utils/cpUtils";
import * as fsUtil from '../../utils/fs';
import { funcHostTaskId, funcWatchProblemMatcher } from "./IProjectCreator";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export const funcEnvName: string = 'func_env';

export enum PythonAlias {
    python = 'python',
    python3 = 'python3',
    py = 'py'
}

const minPythonVersion: string = '3.6.0';

export class PythonProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    public preDeployTask: string = funcPackId;
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
        const funcCoreRequired: string = localize('funcCoreRequired', 'Azure Functions Core Tools must be installed to create, debug, and deploy local Python Functions projects.');
        if (!await validateFuncCoreToolsInstalled(true /* forcePrompt */, funcCoreRequired)) {
            throw new UserCancelledError();
        }

        let createVenv: boolean = false;
        if (await fse.pathExists(path.join(this.functionAppPath, funcEnvName))) {
            const input: MessageItem = await ext.ui.showWarningMessage(localize('funcEnvExists', 'Python virtual environment "{0}" already exists. Overwrite?', funcEnvName), { modal: true }, DialogResponses.yes, DialogResponses.no, DialogResponses.cancel);
            createVenv = input === DialogResponses.yes;
        } else {
            createVenv = true;
        }

        if (createVenv) {
            await createVirtualEnviornment(this.functionAppPath);
        }

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
                    osx: {
                        command: `func extensions install && source ${await getVenvActivatePath(Platform.MacOS)} && func start host`
                    },
                    windows: {
                        command: `func extensions install | ${await getVenvActivatePath(Platform.Windows)} | func start host`
                    },
                    linux: {
                        command: `func extensions install && source ${await getVenvActivatePath(Platform.Linux)} && func start host`
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
                    problemMatcher: funcWatchProblemMatcher
                },
                {
                    label: funcPackId,
                    identifier: funcPackId, // Until this is fixed, the label must be the same as the id: https://github.com/Microsoft/vscode/issues/57707
                    type: 'shell',
                    osx: {
                        command: `source ${await getVenvActivatePath(Platform.MacOS)} && func pack`
                    },
                    windows: {
                        command: `${await getVenvActivatePath(Platform.Windows)} | func pack`
                    },
                    linux: {
                        command: `source ${await getVenvActivatePath(Platform.Linux)} && func pack`
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

    private async createPythonProject(): Promise<void> {
        const funcInitPython: string = 'func init ./ --worker-runtime python';
        switch (process.platform) {
            case Platform.Windows:
                await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, `${await getVenvActivatePath(Platform.Windows)} && ${funcInitPython}`);
                break;
            case Platform.MacOS:
            default:
                await cpUtils.executeCommand(ext.outputChannel, this.functionAppPath, `source ${await getVenvActivatePath(Platform.MacOS)} && ${funcInitPython}`);
                break;
        }
        // .gitignore is created by `func init`
        const gitignorePath: string = path.join(this.functionAppPath, gitignoreFileName);
        if (await fse.pathExists(gitignorePath)) {
            const pythonPackages: string = '.python_packages';
            let writeFile: boolean = false;
            let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();
            // the func_env and ._python_packages are recreated and should not be checked in
            if (!gitignoreContents.includes(funcEnvName)) {
                ext.outputChannel.appendLine(localize('gitAddFunc_Env', 'Adding "{0}" to .gitignore...', funcEnvName));
                gitignoreContents = gitignoreContents.concat(`${os.EOL}${funcEnvName}`);
                writeFile = true;
            }
            if (!gitignoreContents.includes(pythonPackages)) {
                ext.outputChannel.appendLine(localize('gitAddPythonPackages', 'Adding "{0}" to .gitignore...', pythonPackages));
                gitignoreContents = gitignoreContents.concat(`${os.EOL}${pythonPackages}`);
                writeFile = true;
            }

            if (writeFile) {
                await fse.writeFile(gitignorePath, gitignoreContents);
            }
        }

        if (!isWindows) {
            // Make sure local settings isn't using Storage Emulator for non-windows
            // https://github.com/Microsoft/vscode-azurefunctions/issues/583
            const localSettingsPath: string = path.join(this.functionAppPath, localSettingsFileName);
            const localSettings: ILocalAppSettings = await getLocalSettings(localSettingsPath);
            // tslint:disable-next-line:strict-boolean-expressions
            localSettings.Values = localSettings.Values || {};
            localSettings.Values[azureWebJobsStorageKey] = '';
            await fsUtil.writeFormattedJson(localSettingsPath, localSettings);
        }
    }
}

/**
 * Returns undefined if valid or an error message if not
 */
async function validatePythonAlias(pyAlias: PythonAlias): Promise<string | undefined> {
    try {
        const result: cpUtils.ICommandResult = await cpUtils.tryExecuteCommand(undefined /*don't display output*/, undefined /*default to cwd*/, `${pyAlias} --version`);
        if (result.code !== 0) {
            return localize('failValidate', 'Failed to validate version: {0}', result.cmdOutputIncludingStderr);
        }

        const matches: RegExpMatchArray | null = result.cmdOutputIncludingStderr.match(/^Python (\S*)/i);
        if (matches === null || !matches[1]) {
            return localize('failedParse', 'Failed to parse version: {0}', result.cmdOutputIncludingStderr);
        } else {
            const pyVersion: string = matches[1];
            if (semver.gte(pyVersion, minPythonVersion)) {
                return undefined;
            } else {
                return localize('tooLowVersion', 'Python version "{0}" is below minimum version of "{1}".', pyVersion, minPythonVersion);
            }
        }
    } catch (error) {
        return parseError(error).message;
    }
}

async function getVenvActivatePath(platform: Platform): Promise<string> {
    switch (platform) {
        case Platform.Windows:
            return path.join('.', funcEnvName, 'Scripts', 'activate');
        case Platform.MacOS:
        default:
            return path.join('.', funcEnvName, 'bin', 'activate');
    }
}

async function getPythonAlias(): Promise<string> {
    for (const key of Object.keys(PythonAlias)) {
        const alias: PythonAlias = <PythonAlias>PythonAlias[key];
        const errorMessage: string | undefined = await validatePythonAlias(alias);
        if (!errorMessage) {
            return alias;
        }
    }

    const enterPython: MessageItem = { title: localize('enterPython', 'Enter Python Path') };
    const pythonMsg: string = localize('pythonVersionRequired', 'Python {0} or higher is required to create a Python Function project and was not found.', minPythonVersion);
    const result: MessageItem | undefined = await window.showErrorMessage(pythonMsg, { modal: true }, enterPython);
    if (!result) {
        throw new UserCancelledError();
    } else {
        const placeHolder: string = localize('pyAliasPlaceholder', 'Enter the Python alias (if its in your PATH) or the full path to your Python executable.');
        return await ext.ui.showInputBox({ placeHolder, validateInput: validatePythonAlias });
    }
}

export async function createVirtualEnviornment(functionAppPath: string): Promise<void> {
    const pythonAlias: string = await getPythonAlias();
    await cpUtils.executeCommand(ext.outputChannel, functionAppPath, pythonAlias, '-m', 'venv', funcEnvName);
    // install ptvsd - required for debugging in VS Code
    await runPythonCommandInVenv(functionAppPath, 'pip install ptvsd');
}

export async function runPythonCommandInVenv(folderPath: string, command: string): Promise<void> {
    if (process.platform === Platform.Windows) {
        await cpUtils.executeCommand(ext.outputChannel, folderPath, `${await getVenvActivatePath(Platform.Windows)} && ${command}`);
    } else {
        await cpUtils.executeCommand(ext.outputChannel, folderPath, `source ${await getVenvActivatePath(Platform.MacOS)} && ${command}`);
    }
}
