/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { localEventHubsEmulatorConnectionString } from '../../../../../constants';
import { type INetheriteConnectionWizardContext } from '../INetheriteConnectionWizardContext';

export class NetheriteEmulatorGetConnectionStep<T extends INetheriteConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 230;

    public async execute(context: T): Promise<void> {
        context.newEventHubConnectionSettingValue = localEventHubsEmulatorConnectionString;
    }

    public shouldExecute(context: T): boolean {
        return !context.newEventHubConnectionSettingValue;
    }
}
