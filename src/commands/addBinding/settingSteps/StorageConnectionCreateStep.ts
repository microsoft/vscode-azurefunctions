/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IStorageAccountWizardContext } from '@microsoft/vscode-azext-azureutils';
import { getStorageConnectionString } from '../../appSettings/connectionSettings/getLocalConnectionSetting';
import { type IBindingWizardContext } from '../IBindingWizardContext';
import { AzureConnectionCreateStepBase, type IConnection } from './AzureConnectionCreateStepBase';

export class StorageConnectionCreateStep extends AzureConnectionCreateStepBase<IStorageAccountWizardContext & IBindingWizardContext> {
    public async getConnection(context: IStorageAccountWizardContext): Promise<IConnection> {
        return await getStorageConnectionString(context);
    }

    public shouldExecute(context: IStorageAccountWizardContext): boolean {
        return !!context.storageAccount;
    }
}
