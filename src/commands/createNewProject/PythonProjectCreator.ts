/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { MessageItem, QuickPickItem, window } from 'vscode';
import { IActionContext, IAzureQuickPickOptions, parseError, UserCancelledError } from 'vscode-azureextensionui';
import { extensionPrefix, funcPackId, gitignoreFileName, isWindows, localSettingsFileName, Platform, ProjectRuntime, TemplateFilter } from "../../constants";
import { ext } from '../../extensionVariables';
import { funcHostCommand, funcHostTaskLabel } from "../../funcCoreTools/funcHostTask";
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { azureWebJobsStorageKey, getLocalSettings, ILocalAppSettings } from '../../LocalAppSettings';
import { localize } from "../../localize";
import { cpUtils } from "../../utils/cpUtils";
import * as fsUtil from '../../utils/fs';
import { funcWatchProblemMatcher } from "./ProjectCreatorBase";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export enum PythonAlias {
    python = 'python',
    python3 = 'python3',
    py = 'py'
}

export const pythonVenvSetting: string = 'pythonVenv';
const fullPythonVenvSetting: string = `${extensionPrefix}.${pythonVenvSetting}`;

const minPythonVersion: string = '3.6.0';
const minPythonVersionLabel: string = '3.6.x'; // Use invalid semver as the label to make it more clear that any patch version is allowed

export class PythonProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    public preDeployTask: string = funcPackId;
    // "func extensions install" task creates C# build artifacts that should be hidden
    // See issue: https://github.com/Microsoft/vscode-azurefunctions/pull/699
    public readonly excludedFiles: string | string[] = ['obj', 'bin'];

    private _venvName: string | undefined;

    constructor(functionAppPath: string, actionContext: IActionContext, runtime: ProjectRuntime | undefined) {
        super(functionAppPath, actionContext, runtime);
        assert.notEqual(runtime, ProjectRuntime.v1, localize('noV1', 'Python does not support runtime "{0}".', ProjectRuntime.v1));
        this.runtime = ProjectRuntime.v2;
    }

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

    public async onCreateNewProject(): Promise<void> {
        const funcCoreRequired: string = localize('funcCoreRequired', 'Azure Functions Core Tools must be installed to create, debug, and deploy local Python Functions projects.');
        if (!await validateFuncCoreToolsInstalled(true /* forcePrompt */, funcCoreRequired)) {
            throw new UserCancelledError();
        }

        this._venvName = await this.ensureVenv();

        await runPythonCommandInVenv(this._venvName, this.functionAppPath, `${ext.funcCliPath} init ./ --worker-runtime python`);
    }

    public async onInitProjectForVSCode(): Promise<void> {
        this.deploySubpath = `${path.basename(this.functionAppPath)}.zip`;

        if (!this._venvName) {
            this._venvName = await this.ensureVenv();
        }

        await makeVenvDebuggable(this._venvName, this.functionAppPath);
        await this.ensureVenvInFuncIgnore(this._venvName);
        await this.ensureGitIgnoreContents(this._venvName);
        await this.ensureAzureWebJobsStorage();
    }

    public getTasksJson(): {} {
        const funcPackCommand: string = 'func pack';
        const funcExtensionsCommand: string = 'func extensions install';
        const pipInstallCommand: string = 'pip install -r requirements.txt';
        const venvSettingReference: string = `\${config:${fullPythonVenvSetting}}`;
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: funcHostTaskLabel,
                    type: 'shell',
                    osx: {
                        command: convertToVenvCommand(venvSettingReference, Platform.MacOS, funcExtensionsCommand, pipInstallCommand, funcHostCommand)
                    },
                    windows: {
                        command: convertToVenvCommand(venvSettingReference, Platform.Windows, funcExtensionsCommand, pipInstallCommand, funcHostCommand)
                    },
                    linux: {
                        command: convertToVenvCommand(venvSettingReference, Platform.Linux, funcExtensionsCommand, pipInstallCommand, funcHostCommand)
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
                        command: convertToVenvCommand(venvSettingReference, Platform.MacOS, funcPackCommand)
                    },
                    windows: {
                        command: convertToVenvCommand(venvSettingReference, Platform.Windows, funcPackCommand)
                    },
                    linux: {
                        command: convertToVenvCommand(venvSettingReference, Platform.Linux, funcPackCommand)
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

    private async ensureGitIgnoreContents(venvName: string): Promise<void> {
        // .gitignore is created by `func init`
        const gitignorePath: string = path.join(this.functionAppPath, gitignoreFileName);
        if (await fse.pathExists(gitignorePath)) {
            let writeFile: boolean = false;
            let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();

            function ensureInGitIgnore(newLine: string): void {
                if (!gitignoreContents.includes(newLine)) {
                    ext.outputChannel.appendLine(localize('gitAddNewLine', 'Adding "{0}" to .gitignore...', newLine));
                    gitignoreContents = gitignoreContents.concat(`${os.EOL}${newLine}`);
                    writeFile = true;
                }
            }

            ensureInGitIgnore(venvName);
            ensureInGitIgnore('.python_packages');
            ensureInGitIgnore('__pycache__');
            ensureInGitIgnore(`${path.basename(this.functionAppPath)}.zip`);

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

    private async ensureVenvInFuncIgnore(venvName: string): Promise<void> {
        const funcIgnorePath: string = path.join(this.functionAppPath, '.funcignore');
        let funcIgnoreContents: string | undefined;
        if (await fse.pathExists(funcIgnorePath)) {
            funcIgnoreContents = (await fse.readFile(funcIgnorePath)).toString();
            if (funcIgnoreContents && !funcIgnoreContents.includes(venvName)) {
                funcIgnoreContents = funcIgnoreContents.concat(`${os.EOL}${venvName}`);
            }
        }

        if (!funcIgnoreContents) {
            funcIgnoreContents = venvName;
        }

        await fse.writeFile(funcIgnorePath, funcIgnoreContents);
    }

    /**
     * Checks for an existing venv (based on the existence of the activate script). Creates one if none exists and prompts the user if multiple exist
     * @returns the venv name
     */
    private async ensureVenv(): Promise<string> {
        const venvs: string[] = [];
        const fsPaths: string[] = await fse.readdir(this.functionAppPath);
        await Promise.all(fsPaths.map(async (venvName: string) => {
            const stat: fse.Stats = await fse.stat(path.join(this.functionAppPath, venvName));
            if (stat.isDirectory()) {
                const venvActivatePath: string = getVenvActivatePath(venvName);
                if (await fse.pathExists(path.join(this.functionAppPath, venvActivatePath))) {
                    venvs.push(venvName);
                }
            }
        }));

        let result: string;
        if (venvs.length === 0) {
            result = 'func_env';
            await createVirtualEnviornment(result, this.functionAppPath);
        } else if (venvs.length === 1) {
            result = venvs[0];
        } else {
            const picks: QuickPickItem[] = venvs.map((venv: string) => { return { label: venv }; });
            const options: IAzureQuickPickOptions = {
                placeHolder: localize('multipleVenv', 'Detected multiple virtual environments. Select one to use for your project.'),
                suppressPersistence: true
            };
            result = (await ext.ui.showQuickPick(picks, options)).label;
        }

        this.otherSettings[fullPythonVenvSetting] = result;
        return result;
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

function convertToVenvCommand(venvName: string, platform: NodeJS.Platform, ...commands: string[]): string {
    return cpUtils.joinCommands(platform, getVenvActivateCommand(venvName, platform), ...commands);
}

function getVenvActivatePath(venvName: string, platform: NodeJS.Platform = process.platform): string {
    switch (platform) {
        case Platform.Windows:
            return path.join('.', venvName, 'Scripts', 'activate');
        default:
            return path.join('.', venvName, 'bin', 'activate');
    }
}

function getVenvActivateCommand(venvName: string, platform: NodeJS.Platform): string {
    const venvActivatePath: string = getVenvActivatePath(venvName, platform);
    switch (platform) {
        case Platform.Windows:
            return venvActivatePath;
        default:
            return `. ${venvActivatePath}`;
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

export async function createVirtualEnviornment(venvName: string, functionAppPath: string): Promise<void> {
    const pythonAlias: string = await getPythonAlias();
    await cpUtils.executeCommand(ext.outputChannel, functionAppPath, pythonAlias, '-m', 'venv', venvName);
}

export async function makeVenvDebuggable(venvName: string, functionAppPath: string): Promise<void> {
    // install ptvsd - required for debugging in VS Code
    await runPythonCommandInVenv(venvName, functionAppPath, 'pip install ptvsd');
    // install pylint - helpful for debugging in VS Code
    await runPythonCommandInVenv(venvName, functionAppPath, 'pip install pylint');
}

export async function runPythonCommandInVenv(venvName: string, folderPath: string, command: string): Promise<void> {
    // executeCommand always uses Linux '&&' separator, even on Windows
    const fullCommand: string = cpUtils.joinCommands(Platform.Linux, getVenvActivateCommand(venvName, process.platform), command);
    await cpUtils.executeCommand(ext.outputChannel, folderPath, fullCommand);
}
