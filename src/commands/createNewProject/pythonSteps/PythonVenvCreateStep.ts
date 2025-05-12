/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { nonNullProp } from '../../../utils/nonNull';
import { venvUtils } from '../../../utils/venvUtils';
import { type IPythonVenvWizardContext } from './IPythonVenvWizardContext';
import { getPythonVersion } from './pythonVersion';

export class PythonVenvCreateStep extends AzureWizardExecuteStepWithActivityOutput<IPythonVenvWizardContext> {
    stepName: string = 'PythonVenvCreateStep';
    protected getTreeItemLabel(context: IPythonVenvWizardContext): string {
        const pythonAlias: string = nonNullProp(context, 'pythonAlias');
        return localize('createPythonVenv', 'Create {0} virtual environment "{1}"', pythonAlias, nonNullProp(context, 'venvName'));
    }
    protected getOutputLogSuccess(context: IPythonVenvWizardContext): string {
        return localize('createPythonVenvSuccess', 'Successfully created virtual environment "{0}"', nonNullProp(context, 'venvName'));
    }
    protected getOutputLogFail(context: IPythonVenvWizardContext): string {
        return localize('createPythonVenvFail', 'Failed to create virtual environment "{0}"', nonNullProp(context, 'venvName'));
    }
    protected getOutputLogProgress(context: IPythonVenvWizardContext): string {
        return localize('creatingPythonVenv', 'Creating virtual environment "{0}"...', nonNullProp(context, 'venvName'));
    }

    public priority: number = 12;

    public async execute(context: IPythonVenvWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('creatingVenv', 'Creating virtual environment...') });

        const pythonAlias: string = nonNullProp(context, 'pythonAlias');

        // Don't wait just for telemetry and don't block on errors
        void getPythonVersion(pythonAlias).then(value => context.telemetry.properties.pythonVersion = value);

        const venvName = nonNullProp(context, 'venvName');
        await cpUtils.executeCommand(ext.outputChannel, context.projectPath, pythonAlias, '-m', 'venv', venvName);
        await venvUtils.runPipInstallCommandIfPossible(venvName, context.projectPath);
    }

    public shouldExecute(context: IPythonVenvWizardContext): boolean {
        return !context.useExistingVenv && !!context.pythonAlias;
    }

    public configureBeforeExecute(context: IPythonVenvWizardContext): void | Promise<void> {
        if (!context.venvName) {
            context.venvName = '.venv';
        }
    }
}
