/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import { type Progress } from 'vscode';
import { ext } from '../../../extensionVariables';
import { getFuncCliPath } from '../../../funcCoreTools/getFuncCliPath';
import { localize } from '../../../localize';
import { cpUtils } from '../../../utils/cpUtils';
import { type IProjectWizardContext } from '../IProjectWizardContext';
import { ProjectCreateStepBase } from './ProjectCreateStepBase';

export class GoProjectCreateStep extends ProjectCreateStepBase {
    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('initializingGoProject', 'Initializing Go Functions project...') });

        const funcCliPath = await getFuncCliPath(context, context.workspaceFolder);
        // Core tools accepts "go" as the worker-runtime CLI argument and maps it to the "native" worker runtime internally.
        const args = composeArgs(
            withArg('init'),
            withArg('--worker-runtime', 'go'),
            withArg('--no-source-control'),
        )();

        await cpUtils.executeCommand(ext.outputChannel, context.projectPath, funcCliPath, args);
    }
}
