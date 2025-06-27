/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailIcon, activityProgressContext, activityProgressIcon, activitySuccessContext, activitySuccessIcon, createContextValue, nonNullProp, type ExecuteActivityOutput } from '@microsoft/vscode-azext-utils';
import { ConnectionKey } from '../../../../constants';
import { localize } from '../../../../localize';
import { SetConnectionSettingStepBase } from '../SetConnectionSettingStepBase';
import { type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSHubNameSetSettingStep<T extends IDTSConnectionWizardContext> extends SetConnectionSettingStepBase<T> {
    public priority: number = 241;
    public stepName: string = 'dtsHubNameSetSettingStep';
    public debugDeploySetting: ConnectionKey = ConnectionKey.DTSHub;

    public async execute(context: T): Promise<void> {
        await this.setConnectionSetting(context, nonNullProp(context, 'newDTSHubNameConnectionSetting'));
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSHubNameConnectionSetting;
    }

    public createSuccessOutput(context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: localize('prepareDTSHubNameLabel', 'Prepare DTS hub connection: "{0}"', context.newDTSHubNameConnectionSetting),
                contextValue: createContextValue([`${this.stepName}Item`, activitySuccessContext]),
                activityType: ActivityChildType.Success,
                iconPath: activitySuccessIcon,
            }),
            message: localize('prepareDTSHubNameSuccess', 'Successfully prepared DTS hub connection: "{0}".', context.newDTSConnectionSetting),
        };
    }

    public createProgressOutput(): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: localize('prepareDTSHubNameProgressLabel', 'Prepare DTS hub connection: "..."'),
                contextValue: createContextValue([`${this.stepName}Item`, activityProgressContext]),
                activityType: ActivityChildType.Progress,
                iconPath: activityProgressIcon,
            }),
        };
    }

    public createFailOutput(context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: localize('prepareDTSHubNameLabel', 'Prepare DTS hub connection: "{0}"', context.newDTSHubNameConnectionSetting),
                contextValue: createContextValue([`${this.stepName}Item`, activitySuccessContext]),
                activityType: ActivityChildType.Fail,
                iconPath: activityFailIcon,
            }),
            message: localize('prepareDTSHubNameFail', 'Failed to prepare DTS hub connection: "{0}".', context.newDTSConnectionSetting),
        };
    }
}
