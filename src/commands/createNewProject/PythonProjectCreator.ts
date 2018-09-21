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
import { funcPackId, gitignoreFileName, isWindows, localSettingsFileName, Platform, ProjectRuntime, TemplateFilter } from "../../constants";
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
const minPythonVersionLabel: string = '3.6.x'; // Use invalid semver as the label to make it more clear that any patch version is allowed

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

    public async getRuntime(): Promise<ProjectRuntime> {
        // Python only works on v2
        return ProjectRuntime.v2;
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
        // setting the deploySubpath to the result of the 'funcPack' task included below
        this.deploySubpath = `${path.basename(this.functionAppPath)}.zip`;
        // func host task requires this
        await makeVenvDebuggable(this.functionAppPath);
        const funcPackCommand: string = 'func pack';
        const funcHostStartCommand: string = 'func host start';
        const funcExtensionsCommand: string = 'func extensions install';
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: localize('azFunc.runFuncHost', 'Run Functions Host'),
                    identifier: funcHostTaskId,
                    type: 'shell',
                    osx: {
                        command: `${funcExtensionsCommand} && ${convertToVenvCommand(funcHostStartCommand, Platform.MacOS)}`
                    },
                    windows: {
                        command: `${funcExtensionsCommand} ; ${convertToVenvCommand(funcHostStartCommand, Platform.Windows)}`
                    },
                    linux: {
                        command: `${funcExtensionsCommand} && ${convertToVenvCommand(funcHostStartCommand, Platform.Linux)}`
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
                        command: convertToVenvCommand(funcPackCommand, Platform.MacOS)
                    },
                    windows: {
                        command: convertToVenvCommand(funcPackCommand, Platform.Windows)
                    },
                    linux: {
                        command: convertToVenvCommand(funcPackCommand, Platform.Linux)
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
        await runPythonCommandInVenv(this.functionAppPath, 'func init ./ --worker-runtime python');
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

function convertToVenvCommand(command: string, platform: NodeJS.Platform, separator?: string): string {
    switch (platform) {
        case Platform.Windows:
            // tslint:disable-next-line:strict-boolean-expressions
            return `${path.join('.', funcEnvName, 'Scripts', 'activate')} ${separator || ';'} ${command}`;
        default:
            // tslint:disable-next-line:strict-boolean-expressions
            return `. ${path.join('.', funcEnvName, 'bin', 'activate')} ${separator || '&&'} ${command}`;
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
    const pythonMsg: string = localize('pythonVersionRequired', 'Python {0} is required to create a Python Function project and was not found.', minPythonVersionLabel);
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
}

export async function makeVenvDebuggable(functionAppPath: string): Promise<void> {
    // install ptvsd - required for debugging in VS Code
    await runPythonCommandInVenv(functionAppPath, 'pip install ptvsd');
}

export async function runPythonCommandInVenv(folderPath: string, command: string): Promise<void> {
    // executeCommand always uses '&&' separator even on Windows
    await cpUtils.executeCommand(ext.outputChannel, folderPath, convertToVenvCommand(command, process.platform, '&&'));
}
