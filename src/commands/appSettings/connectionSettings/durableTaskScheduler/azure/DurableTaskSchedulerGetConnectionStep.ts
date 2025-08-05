/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { getSchedulerConnectionString, SchedulerAuthenticationType } from '../../../../durableTaskScheduler/copySchedulerConnectionString';
import { type IDTSAzureConnectionWizardContext } from '../IDTSConnectionWizardContext';

export class DurableTaskSchedulerGetConnectionStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 200;

    public async execute(context: T): Promise<void> {
        context.newDTSConnectionSettingValue = getSchedulerConnectionString(context.dts?.properties.endpoint ?? '', SchedulerAuthenticationType.UserAssignedIdentity);
        context.valuesToMask.push(context.newDTSConnectionSettingValue);
    }

    public shouldExecute(context: T): boolean {
        return !context.newDTSConnectionSettingValue;
    }
}
