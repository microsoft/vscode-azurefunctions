/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { workerRuntimeKey } from '../../constants';
import { MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { tryGetFunctionsWorkerRuntimeForProject } from '../../vsCodeConfig/settings';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

/**
 * Automatically adds the worker runtime setting to `local.settings.json` since it's required to debug.
 */
export class WorkerRuntimeSettingValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 330;

    public async execute(context: T): Promise<void> {
        // Check if the key is populated

        const runtime: string | undefined = await tryGetFunctionsWorkerRuntimeForProject(context, context.projectLanguage, context.projectPath);
        if (runtime) {
            await setLocalAppSetting(context, context.projectPath, workerRuntimeKey, runtime, MismatchBehavior.DontChange);
        }
    }

    public shouldExecute(): boolean {
        return true;
    }

    // Add children
}
