/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, activityFailIcon, activityProgressContext, activityProgressIcon, activitySuccessContext, activitySuccessIcon, createContextValue, nonNullProp, type ExecuteActivityOutput } from '@microsoft/vscode-azext-utils';
import { ConnectionKey } from '../../../../constants';
import { localize } from '../../../../localize';
import { SetConnectionSettingStepBase } from '../SetConnectionSettingStepBase';
import { type IDTSAzureConnectionWizardContext, type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSConnectionSetSettingStep<T extends IDTSConnectionWizardContext> extends SetConnectionSettingStepBase<T> {
    public priority: number = 240;
    public stepName: string = 'dtsConnectionSetSettingStep';
    public debugDeploySetting: ConnectionKey = ConnectionKey.DTS;

    public async execute(context: T): Promise<void> {
        let newDTSConnectionSetting = nonNullProp(context, 'newDTSConnectionSetting');
        if ((context as unknown as IDTSAzureConnectionWizardContext).managedIdentity) {
            newDTSConnectionSetting = newDTSConnectionSetting.replace('<ClientID>', (context as unknown as IDTSAzureConnectionWizardContext).managedIdentity?.clientId ?? '');
        }

        await this.setConnectionSetting(context, newDTSConnectionSetting);
        context.newDTSConnectionSetting = newDTSConnectionSetting;

        context.valuesToMask.push(context.newDTSConnectionSetting);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSConnectionSetting;
    }

    public createSuccessOutput(context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: localize('prepareDTSConnectionProgressLabel', 'Prepare DTS connection: "{0}"', 'Endpoint=...'),
                contextValue: createContextValue([`${this.stepName}Item`, activitySuccessContext]),
                activityType: ActivityChildType.Success,
                iconPath: activitySuccessIcon,
            }),
            message: localize('prepareDTSConnectionSuccess', 'Successfully prepared DTS connection: "{0}".', context.newDTSConnectionSetting),
        };
    }

    public createProgressOutput(): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: localize('prepareDTSConnectionProgressLabel', 'Prepare DTS connection: "{0}"', 'Endpoint=...'),
                contextValue: createContextValue([`${this.stepName}Item`, activityProgressContext]),
                activityType: ActivityChildType.Progress,
                iconPath: activityProgressIcon,
            }),
        };
    }

    public createFailOutput(context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: localize('prepareDTSConnectionProgressLabel', 'Prepare DTS connection: "{0}"', 'Endpoint=...'),
                contextValue: createContextValue([`${this.stepName}Item`, activityFailContext]),
                activityType: ActivityChildType.Fail,
                iconPath: activityFailIcon,
            }),
            message: localize('prepareDTSConnectionFail', 'Failed to prepare DTS connection: "{0}".', context.newDTSConnectionSetting),
        };
    }
}
