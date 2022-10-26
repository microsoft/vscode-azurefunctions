/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { Progress } from 'vscode';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { nonNullProp } from '../../../utils/nonNull';
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
        venvUtils.runPipInstallCommandIfPossible(context.venvName, context.projectPath);
    }

    public shouldExecute(context: IPythonVenvWizardContext): boolean {
        return !context.useExistingVenv && !!context.pythonAlias;
    }
}
