/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as semver from 'semver';
import { QuickPickItem } from 'vscode';
import { IAzureQuickPickOptions, parseError, UserCancelledError } from 'vscode-azureextensionui';
import { ext } from '../../../extensionVariables';
import { validateFuncCoreToolsInstalled } from '../../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from "../../../localize";
import { getGlobalFuncExtensionSetting } from '../../../ProjectSettings';
import { cpUtils } from "../../../utils/cpUtils";
import { venvUtils } from '../../../utils/venvUtils';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { ProjectCreateStepBase } from './ProjectCreateStepBase';

const minPythonVersion: string = '3.6.0';
const maxPythonVersion: string = '3.7.0';
const minPythonVersionLabel: string = '3.6.x'; // Use invalid semver as the label to make it more clear that any patch version is allowed

export class PythonProjectCreateStep extends ProjectCreateStepBase {
    private constructor() {
        super();
    }

    public static async createStep(): Promise<PythonProjectCreateStep> {
        const funcCoreRequired: string = localize('funcCoreRequired', 'Azure Functions Core Tools must be installed to create, debug, and deploy local Python Functions projects.');
        if (!await validateFuncCoreToolsInstalled(funcCoreRequired)) {
            throw new UserCancelledError();
        }
        return new PythonProjectCreateStep();
    }

    public async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
        const venvName: string = await ensureVenv(wizardContext.projectPath);
        await venvUtils.runCommandInVenv(`${ext.funcCliPath} init ./ --worker-runtime python`, venvName, wizardContext.projectPath);
    }
}

export async function ensureVenv(projectPath: string): Promise<string> {
    const venvs: string[] = [];
    const fsPaths: string[] = await fse.readdir(projectPath);
    await Promise.all(fsPaths.map(async (venvName: string) => {
        if (await venvUtils.venvExists(venvName, projectPath)) {
            venvs.push(venvName);
        }
    }));

    let result: string;
    if (venvs.length === 0) {
        result = '.env'; // default name
        await createVirtualEnviornment(result, projectPath);
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

    return result;
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

export async function createVirtualEnviornment(venvName: string, projectPath: string): Promise<void> {
    const pythonAlias: string = await getPythonAlias();
    await cpUtils.executeCommand(ext.outputChannel, projectPath, pythonAlias, '-m', 'venv', venvName);
}
