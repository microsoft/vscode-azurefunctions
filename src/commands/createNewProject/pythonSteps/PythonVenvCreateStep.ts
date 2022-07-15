/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as fse from 'fs-extra';
import * as path from 'path';
import { Progress } from 'vscode';
import { requirementsFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { venvUtils } from '../../../utils/venvUtils';
import { IPythonVenvWizardContext } from './IPythonVenvWizardContext';
import { getPythonVersion } from './pythonVersion';

export class PythonVenvCreateStep extends AzureWizardExecuteStep<IPythonVenvWizardContext> {
    public priority: number = 12;

    public async execute(context: IPythonVenvWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('creatingVenv', 'Creating virtual environment...') });

        const pythonAlias: string = nonNullProp(context, 'pythonAlias');
        if (!context.venvName) {
            context.venvName = '.venv';
        }

        // Don't wait just for telemetry and don't block on errors
        void getPythonVersion(pythonAlias).then(value => context.telemetry.properties.pythonVersion = value);

        await cpUtils.executeCommand(ext.outputChannel, context.projectPath, pythonAlias, '-m', 'venv', context.venvName);

        const requirementsPath: string = path.join(context.projectPath, requirementsFileName);
        if (await fse.pathExists(requirementsPath)) {
            try {
                // Attempt to install packages so that users get Intellisense right away
                await venvUtils.runCommandInVenv(`pip install -r ${requirementsFileName}`, context.venvName, context.projectPath);
            } catch {
                ext.outputChannel.appendLog(localize('pipInstallFailure', 'WARNING: Failed to install packages in your virtual environment. Run "pip install" manually instead.'));
            }
        }
    }

    public shouldExecute(context: IPythonVenvWizardContext): boolean {
        return !context.useExistingVenv && !!context.pythonAlias;
    }
}
