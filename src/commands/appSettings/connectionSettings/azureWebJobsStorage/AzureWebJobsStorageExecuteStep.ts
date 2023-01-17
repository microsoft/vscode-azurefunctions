/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageAccountWizardContext } from '@microsoft/vscode-azext-azureutils';
import { ConnectionKey, ConnectionKeyValues, ConnectionType, localStorageEmulatorConnectionString } from '../../../../constants';
import { getStorageConnectionString } from '../getLocalConnectionSetting';
import { SetConnectionSettingBaseStep } from '../SetConnectionSettingBaseStep';
import { IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export class AzureWebJobsStorageExecuteStep<T extends IAzureWebJobsStorageWizardContext> extends SetConnectionSettingBaseStep<T> {
    public priority: number = 230;
    public debugDeploySetting: ConnectionKeyValues = ConnectionKey.Storage;

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
