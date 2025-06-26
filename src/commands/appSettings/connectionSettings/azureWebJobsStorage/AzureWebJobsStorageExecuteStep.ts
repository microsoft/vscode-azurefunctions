/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IStorageAccountWizardContext } from '@microsoft/vscode-azext-azureutils';
import { ConnectionKey, ConnectionType, localStorageEmulatorConnectionString } from '../../../../constants';
import { SetConnectionSettingStepBase } from '../SetConnectionSettingStepBase';
import { getStorageConnectionString } from '../getLocalConnectionSetting';
import { type IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export class AzureWebJobsStorageExecuteStep<T extends IAzureWebJobsStorageWizardContext> extends SetConnectionSettingStepBase<T> {
    public priority: number = 230;
    public debugDeploySetting: ConnectionKey = ConnectionKey.Storage;

    public async execute(context: T): Promise<void> {
        let value: string;

        if (context.azureWebJobsStorageType === ConnectionType.Emulator) {
            value = localStorageEmulatorConnectionString;
        } else {
            value = (await getStorageConnectionString(<IStorageAccountWizardContext>context)).connectionString;
        }

        await this.setConnectionSetting(context, value);
    }

    public shouldExecute(context: T): boolean {
        return !!context.azureWebJobsStorageType;
    }
}
