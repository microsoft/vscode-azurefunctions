/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type ExecuteActivityOutput } from '@microsoft/vscode-azext-utils';
import { ThemeColor, ThemeIcon } from 'vscode';
import { localSettingsFileName, workerRuntimeKey } from '../../constants';
import { getLocalAppSetting, MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { tryGetFunctionsWorkerRuntimeForProject } from '../../vsCodeConfig/settings';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

/**
 * Automatically adds or validates the worker runtime setting required in `local.settings.json` for debugging.
 */
export class WorkerRuntimeSettingValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo: Revisit priority
    public priority: number = 330;
    public stepName: string = 'workerRuntimeSettingValidateStep';
    protected getOutputLogSuccess = () => localize('validateWorkerRuntimeSuccess', 'Successfully verified a value for "{0}" setting in "{1}".', workerRuntimeKey, localSettingsFileName);
    protected getOutputLogFail = () => localize('validateWorkerRuntimeFail', 'Failed to find a value for "{0}" setting in "{1}".', workerRuntimeKey, localSettingsFileName);
    protected getTreeItemLabel = () => this.newWorkerRuntimeSetting ?
        localize('setWorkerRuntimeLabel', 'Set "{0}" as "{1}" in "{2}"', workerRuntimeKey, this.newWorkerRuntimeSetting, localSettingsFileName) :
        localize('validateWorkerRuntimeLabel', 'Validate: "{0}" has value in "{1}"', workerRuntimeKey, localSettingsFileName);

    private newWorkerRuntimeSetting?: string;

    public async execute(context: T): Promise<void> {
        this.options.continueOnFail = true;

        const hasWorkerRuntimeSetting: boolean = !!await getLocalAppSetting(context, context.projectPath, workerRuntimeKey);
        if (hasWorkerRuntimeSetting) {
            return;
        }

        const runtime: string | undefined = await tryGetFunctionsWorkerRuntimeForProject(context, context.projectLanguage, context.projectPath);
        if (!runtime) {
            throw new Error(localize('errorSetWorkerRuntime', 'Failed to set new "{0}" setting.', workerRuntimeKey));
        }

        await setLocalAppSetting(context, context.projectPath, workerRuntimeKey, runtime, MismatchBehavior.DontChange);
        this.newWorkerRuntimeSetting = runtime;
    }

    public shouldExecute(): boolean {
        return true;
    }

    public createFailOutput(): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: this.getTreeItemLabel(),
                tooltip: this.getOutputLogFail(),
                activityType: ActivityChildType.Fail,
                iconPath: new ThemeIcon('warning', new ThemeColor('charts.orange')),
                contextValue: createContextValue([`${this.stepName}Item`, activityFailContext]),
            }),
            message: this.getOutputLogFail(),
        };
    }
}
