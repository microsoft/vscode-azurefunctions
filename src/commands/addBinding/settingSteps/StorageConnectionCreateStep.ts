/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageAccountWizardContext } from 'vscode-azureextensionui';
import { getStorageConnectionString } from '../../../utils/azure';
import { IBindingWizardContext } from '../IBindingWizardContext';
import { AzureConnectionCreateStepBase, IConnection } from './AzureConnectionCreateStepBase';

export class StorageConnectionCreateStep extends AzureConnectionCreateStepBase<IStorageAccountWizardContext & IBindingWizardContext> {
    public async getConnection(wizardContext: IStorageAccountWizardContext): Promise<IConnection> {
        return await getStorageConnectionString(wizardContext);
    }

    public shouldExecute(wizardContext: IStorageAccountWizardContext): boolean {
        return !!wizardContext.storageAccount;
    }
}
