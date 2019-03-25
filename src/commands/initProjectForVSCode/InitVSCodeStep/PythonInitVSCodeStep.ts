/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { DebugConfiguration, TaskDefinition } from 'vscode';
import { extensionPrefix, extInstallCommand, extInstallTaskName, func, funcWatchProblemMatcher, gitignoreFileName, hostStartCommand, isWindows, localSettingsFileName, packTaskName, Platform, pythonVenvSetting } from "../../../constants";
import { pythonDebugConfig } from '../../../debug/PythonDebugProvider';
import { azureWebJobsStorageKey, getLocalAppSettings, ILocalAppSettings } from '../../../LocalAppSettings';
import { writeFormattedJson } from '../../../utils/fs';
import { venvUtils } from '../../../utils/venvUtils';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { ensureVenv } from '../../createNewProject/ProjectCreateStep/PythonProjectCreateStep';
import { ScriptInitVSCodeStep } from './ScriptInitVSCodeStep';

const fullPythonVenvSetting: string = `${extensionPrefix}.${pythonVenvSetting}`;

export class PythonInitVSCodeStep extends ScriptInitVSCodeStep {
    protected preDeployTask: string = packTaskName;

    protected async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
        const zipPath: string = this.setDeploySubpath(wizardContext, `${path.basename(wizardContext.projectPath)}.zip`);

        const venvName: string = await ensureVenv(wizardContext.projectPath);
        this.otherSettings[fullPythonVenvSetting] = venvName;

        await ensureVenvInFuncIgnore(wizardContext.projectPath, venvName);
        await ensureGitIgnoreContents(wizardContext.projectPath, venvName, zipPath);
        await ensureAzureWebJobsStorage(wizardContext.projectPath);
    }

    protected getDebugConfiguration(): DebugConfiguration {
        return pythonDebugConfig;
    }

    protected getTasks(): TaskDefinition[] {
        const pipInstallLabel: string = 'pipInstall';
        const venvSettingReference: string = `\${config:${fullPythonVenvSetting}}`;

        function getPipInstallCommand(platform: NodeJS.Platform): string {
            return venvUtils.convertToVenvPythonCommand('pip install -r requirements.txt', venvSettingReference, platform);
        }

        return [
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
        ];
    }

    protected getRecommendedExtensions(): string[] {
        return ['ms-python.python'];
    }
}

async function ensureGitIgnoreContents(projectPath: string, venvName: string, zipPath: string): Promise<void> {
    // .gitignore is created by `func init`
    const gitignorePath: string = path.join(projectPath, gitignoreFileName);
    if (await fse.pathExists(gitignorePath)) {
        let writeFile: boolean = false;
        let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();

        function ensureInGitIgnore(newLine: string): void {
            if (!gitignoreContents.includes(newLine)) {
                gitignoreContents = gitignoreContents.concat(`${os.EOL}${newLine}`);
                writeFile = true;
            }
        }

        ensureInGitIgnore(venvName);
        ensureInGitIgnore('.python_packages');
        ensureInGitIgnore('__pycache__');
        ensureInGitIgnore(zipPath);

        if (writeFile) {
            await fse.writeFile(gitignorePath, gitignoreContents);
        }
    }
}

async function ensureAzureWebJobsStorage(projectPath: string): Promise<void> {
    if (!isWindows) {
        // Make sure local settings isn't using Storage Emulator for non-windows
        // https://github.com/Microsoft/vscode-azurefunctions/issues/583
        const localSettingsPath: string = path.join(projectPath, localSettingsFileName);
        const localSettings: ILocalAppSettings = await getLocalAppSettings(localSettingsPath);
        // tslint:disable-next-line:strict-boolean-expressions
        localSettings.Values = localSettings.Values || {};
        localSettings.Values[azureWebJobsStorageKey] = '';
        await writeFormattedJson(localSettingsPath, localSettings);
    }
}

async function ensureVenvInFuncIgnore(projectPath: string, venvName: string): Promise<void> {
    const funcIgnorePath: string = path.join(projectPath, '.funcignore');
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
