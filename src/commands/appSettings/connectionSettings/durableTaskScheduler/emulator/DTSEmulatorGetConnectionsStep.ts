/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { getSchedulerConnectionString, SchedulerAuthenticationType } from '../../../../durableTaskScheduler/copySchedulerConnectionString';
import { type IDTSConnectionWizardContext } from '../IDTSConnectionWizardContext';

export class DTSEmulatorGetConnectionsStep<T extends IDTSConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 200;

    public async execute(context: T): Promise<void> {
        if (context.dtsEmulator) {
            context.newDTSConnectionSettingValue = getSchedulerConnectionString(context.dtsEmulator.schedulerEndpoint.toString(), SchedulerAuthenticationType.None);
        }

        context.newDTSHubConnectionSettingValue = 'default';
    }

    public shouldExecute(context: T): boolean {
        return !context.newDTSConnectionSettingValue || !context.newDTSHubConnectionSettingValue;
    }
}
