/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { localStorageEmulatorConnectionString } from '../../../../constants';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';

export class StorageEmulatorGetConnectionStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 230;

    public async execute(context: T): Promise<void> {
        context.newStorageConnectionSettingValue = localStorageEmulatorConnectionString;
    }

    public shouldExecute(context: T): boolean {
        return !context.newStorageConnectionSettingValue;
    }
}
