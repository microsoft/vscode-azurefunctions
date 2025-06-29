/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IStorageAccountWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { CodeAction, ConnectionKey, ConnectionType, localStorageEmulatorConnectionString } from '../../../../constants';
import { getStorageConnectionString } from '../getLocalConnectionSetting';
import { setLocalSetting } from '../setConnectionSetting';
import { type IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export class AzureWebJobsStorageSetSettingStep<T extends IAzureWebJobsStorageWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 230;
    public debugDeploySetting: ConnectionKey = ConnectionKey.Storage;

    public async execute(context: T): Promise<void> {
        let value: string;

        if (context.azureWebJobsStorageType === ConnectionType.Emulator) {
            value = localStorageEmulatorConnectionString;
        } else {
            value = (await getStorageConnectionString(<IStorageAccountWizardContext>context)).connectionString;
        }

        if (context.action === CodeAction.Debug) {
            await setLocalSetting(context, ConnectionKey.Storage, value);
        } else {
            context[ConnectionKey.Storage] = value;
        }
    }

    public shouldExecute(context: T): boolean {
        return !!context.azureWebJobsStorageType;
    }
}
