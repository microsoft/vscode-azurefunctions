/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type ExecuteActivityOutput } from '@microsoft/vscode-azext-utils';
import { localSettingsFileName, warningIcon, workerRuntimeKey } from '../../constants';
import { getLocalAppSetting, MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { tryGetFunctionsWorkerRuntimeForProject } from '../../vsCodeConfig/settings';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

// Todo: Double check this logic against the old logic
/**
 * Automatically adds or validates the worker runtime setting required in `local.settings.json` for debugging.
 */
export class WorkerRuntimeSettingValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo: Revisit priority
    public priority: number = 330;
    public stepName: string = 'workerRuntimeSettingValidateStep';

    protected getOutputLogSuccess = () => localize('validateWorkerRuntimeSuccess', 'Successfully verified a value for "{0}" setting in "{1}".', workerRuntimeKey, localSettingsFileName);
    protected getOutputLogFail = () => localize('validateWorkerRuntimeFail', 'Failed to find a value for "{0}" setting in "{1}".', workerRuntimeKey, localSettingsFileName);
    protected getTreeItemLabel = () => localize('workerRuntimeSettingLabel', '"{0}" setting', workerRuntimeKey);

    private _workerRuntimeValue?: string;

    public async execute(context: T): Promise<void> {
        this.options.continueOnFail = true;

        const existingValue: string | undefined = await getLocalAppSetting(context, context.projectPath, workerRuntimeKey);
        if (existingValue) {
            this._workerRuntimeValue = existingValue;
            return;
        }

        const runtime: string | undefined = await tryGetFunctionsWorkerRuntimeForProject(context, context.projectLanguage, context.projectPath);
        if (!runtime) {
            throw new Error(localize('errorSetWorkerRuntime', 'Failed to set new "{0}" setting.', workerRuntimeKey));
        }

        await setLocalAppSetting(context, context.projectPath, workerRuntimeKey, runtime, MismatchBehavior.DontChange);
        this._workerRuntimeValue = runtime;
    }

    public shouldExecute(): boolean {
        return true;
    }

    public createSuccessOutput(context: T): ExecuteActivityOutput {
        const output = super.createSuccessOutput(context);
        if (output.item) {
            output.item.description = this._workerRuntimeValue;
        }
        return output;
    }

    public createFailOutput(): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: this.getTreeItemLabel(),
                description: this._workerRuntimeValue,
                tooltip: this.getOutputLogFail(),
                activityType: ActivityChildType.Fail,
                iconPath: warningIcon,
                contextValue: createContextValue([`${this.stepName}Item`, activityFailContext]),
            }),
            message: this.getOutputLogFail(),
        };
    }
}
