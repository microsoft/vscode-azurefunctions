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
import { funcHostCommand, funcHostTaskLabel } from "../../funcCoreTools/funcHostTask";
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { azureWebJobsStorageKey, getLocalSettings, ILocalAppSettings } from '../../LocalAppSettings';
import { localize } from "../../localize";
import { cpUtils } from "../../utils/cpUtils";
import * as fsUtil from '../../utils/fs';
import { funcWatchProblemMatcher } from "./IProjectCreator";
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
    // "func extensions install" task creates C# build artifacts that should be hidden
    // See issue: https://github.com/Microsoft/vscode-azurefunctions/pull/699
    public readonly excludedFiles: string | string[] = ['obj', 'bin'];

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
                    preLaunchTask: funcHostTaskLabel
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

        await runPythonCommandInVenv(this.functionAppPath, 'func init ./ --worker-runtime python');
    }

    public async getTasksJson(): Promise<{}> {
        // The code in getTasksJson occurs for createNewProject _and_ initProjectForVSCode, which is why the next few lines are here even if they're only somewhat related to 'getting the tasks.json'
        // We should probably refactor this eventually to make it more clear what's going on.
        this.deploySubpath = `${path.basename(this.functionAppPath)}.zip`;
        await makeVenvDebuggable(this.functionAppPath);
        await this.ensureVenvInFuncIgnore();
        await this.ensureGitIgnoreContents();
        await this.ensureAzureWebJobsStorage();

        const funcPackCommand: string = 'func pack';
        const funcExtensionsCommand: string = 'func extensions install';
        const pipInstallCommand: string = 'pip install -r requirements.txt';
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: funcHostTaskLabel,
                    type: 'shell',
                    osx: {
                        command: convertToVenvCommand(Platform.MacOS, funcExtensionsCommand, pipInstallCommand, funcHostCommand)
                    },
                    windows: {
                        command: convertToVenvCommand(Platform.Windows, funcExtensionsCommand, pipInstallCommand, funcHostCommand)
                    },
                    linux: {
                        command: convertToVenvCommand(Platform.Linux, funcExtensionsCommand, pipInstallCommand, funcHostCommand)
                    },
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    options: {
                        env: {
                            languageWorkers__python__arguments: '-m ptvsd --host 127.0.0.1 --port 9091'
                        }
                    },
                    problemMatcher: funcWatchProblemMatcher
                },
                {
                    label: funcPackId,
                    type: 'shell',
                    osx: {
                        command: convertToVenvCommand(Platform.MacOS, funcPackCommand)
                    },
                    windows: {
                        command: convertToVenvCommand(Platform.Windows, funcPackCommand)
                    },
                    linux: {
                        command: convertToVenvCommand(Platform.Linux, funcPackCommand)
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

    private async ensureGitIgnoreContents(): Promise<void> {
        // .gitignore is created by `func init`
        const gitignorePath: string = path.join(this.functionAppPath, gitignoreFileName);
        if (await fse.pathExists(gitignorePath)) {
            let writeFile: boolean = false;
            let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();

            function esnureInGitIgnore(newLine: string): void {
                if (!gitignoreContents.includes(newLine)) {
                    ext.outputChannel.appendLine(localize('gitAddNewLine', 'Adding "{0}" to .gitignore...', newLine));
                    gitignoreContents = gitignoreContents.concat(`${os.EOL}${newLine}`);
                    writeFile = true;
                }
            }

            esnureInGitIgnore(funcEnvName);
            esnureInGitIgnore('.python_packages');
            esnureInGitIgnore('__pycache__');
            esnureInGitIgnore(`${path.basename(this.functionAppPath)}.zip`);

            if (writeFile) {
                await fse.writeFile(gitignorePath, gitignoreContents);
            }
        }
    }

    private async ensureAzureWebJobsStorage(): Promise<void> {
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

    private async ensureVenvInFuncIgnore(): Promise<void> {
        const funcIgnorePath: string = path.join(this.functionAppPath, '.funcignore');
        let funcIgnoreContents: string | undefined;
        if (await fse.pathExists(funcIgnorePath)) {
            funcIgnoreContents = (await fse.readFile(funcIgnorePath)).toString();
            if (funcIgnoreContents && !funcIgnoreContents.includes(funcEnvName)) {
                funcIgnoreContents = funcIgnoreContents.concat(`${os.EOL}${funcEnvName}`);
            }
        }

        if (!funcIgnoreContents) {
            funcIgnoreContents = funcEnvName;
        }

        await fse.writeFile(funcIgnorePath, funcIgnoreContents);
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

function convertToVenvCommand(platform: NodeJS.Platform, ...commands: string[]): string {
    return cpUtils.joinCommands(platform, getVenvActivateCommand(platform), ...commands);
}

function getVenvActivateCommand(platform: NodeJS.Platform): string {
    switch (platform) {
        case Platform.Windows:
            return `${path.join('.', funcEnvName, 'Scripts', 'activate')}`;
        default:
            return `. ${path.join('.', funcEnvName, 'bin', 'activate')}`;
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
    // install pylint - helpful for debugging in VS Code
    await runPythonCommandInVenv(functionAppPath, 'pip install pylint');
}

export async function runPythonCommandInVenv(folderPath: string, command: string): Promise<void> {
    // executeCommand always uses Linux '&&' separator, even on Windows
    const fullCommand: string = cpUtils.joinCommands(Platform.Linux, getVenvActivateCommand(process.platform), command);
    await cpUtils.executeCommand(ext.outputChannel, folderPath, fullCommand);
}
