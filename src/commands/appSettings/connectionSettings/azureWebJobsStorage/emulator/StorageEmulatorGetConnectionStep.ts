/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { localStorageEmulatorConnectionString } from '../../../../../constants';
import { type IStorageAzureConnectionWizard } from '../IStorageConnectionWizardContext';

export class StorageEmulatorGetConnectionStep<T extends IStorageAzureConnectionWizard> extends AzureWizardExecuteStep<T> {
    public priority: number = 230;

    public async execute(context: T): Promise<void> {
        // Todo: Should we handle logic to run the Azurite emulator in here as well and rename the step to StorageEmulatorStartStep?
        context.newStorageConnectionSettingValue = localStorageEmulatorConnectionString;
    }

    public shouldExecute(context: T): boolean {
        return !context.newStorageConnectionSettingValue;
    }
}
