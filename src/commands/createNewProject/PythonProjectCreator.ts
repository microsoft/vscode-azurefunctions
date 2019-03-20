/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { QuickPickItem } from 'vscode';
import { IActionContext, IAzureQuickPickOptions, parseError, UserCancelledError } from 'vscode-azureextensionui';
import { extensionPrefix, extInstallCommand, extInstallTaskName, func, funcWatchProblemMatcher, gitignoreFileName, hostStartCommand, isWindows, localSettingsFileName, packTaskName, Platform, ProjectRuntime, pythonVenvSetting, TemplateFilter } from "../../constants";
import { pythonDebugConfig } from '../../debug/PythonDebugProvider';
import { ext } from '../../extensionVariables';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { azureWebJobsStorageKey, getLocalAppSettings, ILocalAppSettings } from '../../LocalAppSettings';
import { localize } from "../../localize";
import { getGlobalFuncExtensionSetting } from '../../ProjectSettings';
import { cpUtils } from "../../utils/cpUtils";
import * as fsUtil from '../../utils/fs';
import { venvUtils } from '../../utils/venvUtils';
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

const fullPythonVenvSetting: string = `${extensionPrefix}.${pythonVenvSetting}`;

const minPythonVersion: string = '3.6.0';
const maxPythonVersion: string = '3.7.0';
const minPythonVersionLabel: string = '3.6.x'; // Use invalid semver as the label to make it more clear that any patch version is allowed

export class PythonProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    public preDeployTask: string = packTaskName;

    private _venvName: string | undefined;

    constructor(functionAppPath: string, actionContext: IActionContext, runtime: ProjectRuntime | undefined, language: string) {
        super(functionAppPath, actionContext, runtime, language);
        assert.notEqual(runtime, ProjectRuntime.v1, localize('noV1', 'Python does not support runtime "{0}".', ProjectRuntime.v1));
        this.setRuntime(ProjectRuntime.v2);
    }

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [pythonDebugConfig]
        };
    }

    public async onCreateNewProject(): Promise<void> {
        const funcCoreRequired: string = localize('funcCoreRequired', 'Azure Functions Core Tools must be installed to create, debug, and deploy local Python Functions projects.');
        if (!await validateFuncCoreToolsInstalled(funcCoreRequired)) {
            throw new UserCancelledError();
        }

        this._venvName = await this.ensureVenv();

        await venvUtils.runCommandInVenv(`${ext.funcCliPath} init ./ --worker-runtime python`, this._venvName, this.functionAppPath);
    }

    public async onInitProjectForVSCode(): Promise<void> {
        this.deploySubpath = `${path.basename(this.functionAppPath)}.zip`;

        if (!this._venvName) {
            this._venvName = await this.ensureVenv();
        }

        await this.ensureVenvInFuncIgnore(this._venvName);
        await this.ensureGitIgnoreContents(this._venvName);
        await this.ensureAzureWebJobsStorage();
    }

    public getTasksJson(): {} {
        const pipInstallLabel: string = 'pipInstall';
        const venvSettingReference: string = `\${config:${fullPythonVenvSetting}}`;

        function getPipInstallCommand(platform: NodeJS.Platform): string {
            return venvUtils.convertToVenvPythonCommand('pip install -r requirements.txt', venvSettingReference, platform);
        }

        return {
            version: '2.0.0',
            tasks: [
                {
                    type: func,
                    command: hostStartCommand,
                    problemMatcher: funcWatchProblemMatcher,
                    isBackground: true,
                    dependsOn: extInstallTaskName
                },
                {
                    type: func,
                    command: extInstallCommand,
                    dependsOn: pipInstallLabel,
                    problemMatcher: []
                },
                {
                    label: pipInstallLabel,
                    type: 'shell',
                    osx: {
                        command: getPipInstallCommand(Platform.MacOS)
                    },
                    windows: {
                        command: getPipInstallCommand(Platform.Windows)
                    },
                    linux: {
                        command: getPipInstallCommand(Platform.Linux)
                    },
                    problemMatcher: []
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
            const localSettings: ILocalAppSettings = await getLocalAppSettings(localSettingsPath);
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
            if (await venvUtils.venvExists(venvName, this.functionAppPath)) {
                venvs.push(venvName);
            }
        }));

        let result: string;
        if (venvs.length === 0) {
            result = '.env'; // default name
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
async function validatePythonAlias(pyAlias: string, validateMaxVersion: boolean = false): Promise<string | undefined> {
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
            if (semver.lt(pyVersion, minPythonVersion)) {
                return localize('tooLowVersion', 'Python version "{0}" is below minimum version of "{1}".', pyVersion, minPythonVersion);
            } else if (validateMaxVersion && semver.gte(pyVersion, maxPythonVersion)) {
                return localize('tooHighVersion', 'Python version "{0}" is greater than or equal to the maximum version of "{1}".', pyVersion, maxPythonVersion);
            } else {
                return undefined;
            }
        }
    } catch (error) {
        return parseError(error).message;
    }
}

async function getPythonAlias(): Promise<string> {
    const aliasesToTry: string[] = ['python3.6', 'py -3.6', 'python3', 'python', 'py'];
    const globalPythonPathSetting: string | undefined = getGlobalFuncExtensionSetting('pythonPath', 'python');
    if (globalPythonPathSetting) {
        aliasesToTry.unshift(globalPythonPathSetting);
    }

    for (const alias of aliasesToTry) {
        // Validate max version when silently picking the alias for the user
        const errorMessage: string | undefined = await validatePythonAlias(alias, true /* validateMaxVersion */);
        if (!errorMessage) {
            return alias;
        }
    }

    const prompt: string = localize('pyAliasPlaceholder', 'Enter the alias or full path of the Python "{0}" executable to use.', minPythonVersionLabel);
    // Don't validate max version when prompting (because the Functions team will assumably support 3.7+ at some point and we don't want to block people from using that)
    return await ext.ui.showInputBox({ prompt, validateInput: validatePythonAlias });
}

export async function createVirtualEnviornment(venvName: string, functionAppPath: string): Promise<void> {
    const pythonAlias: string = await getPythonAlias();
    await cpUtils.executeCommand(ext.outputChannel, functionAppPath, pythonAlias, '-m', 'venv', venvName);
}
