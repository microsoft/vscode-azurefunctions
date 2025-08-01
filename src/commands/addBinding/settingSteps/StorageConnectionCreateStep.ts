/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IStorageAccountWizardContext } from '@microsoft/vscode-azext-azureutils';
import { getStorageConnectionString } from '../../appSettings/connectionSettings/azureWebJobsStorage/getStorageConnectionString';
import { type IFunctionWizardContext } from '../../createFunction/IFunctionWizardContext';
import { AzureConnectionCreateStepBase, type IConnection } from './AzureConnectionCreateStepBase';

export class StorageConnectionCreateStep extends AzureConnectionCreateStepBase<IStorageAccountWizardContext & IFunctionWizardContext> {
    public async getConnection(context: IStorageAccountWizardContext & IFunctionWizardContext): Promise<IConnection> {
        return await getStorageConnectionString(context);
    }

    public shouldExecute(context: IStorageAccountWizardContext & IFunctionWizardContext): boolean {
        return !!context.storageAccount || !!context.useStorageEmulator;
    }
}
