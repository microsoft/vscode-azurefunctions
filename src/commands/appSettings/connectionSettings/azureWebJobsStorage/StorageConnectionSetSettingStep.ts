/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { CodeAction, ConnectionKey } from '../../../../constants';
import { setLocalSetting } from '../setConnectionSetting';
import { type IStorageConnectionWizardContext } from './IStorageConnectionWizardContext';

export class StorageConnectionSetSettingStep<T extends IStorageConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 240;

    public async execute(context: T): Promise<void> {
        if (!context.newStorageConnectionSettingKey) {
            context.newStorageConnectionSettingKey = ConnectionKey.Storage;
        }

        if (context.action === CodeAction.Debug) {
            await setLocalSetting(
                context,
                context.newStorageConnectionSettingKey,
                nonNullProp(context, 'newStorageConnectionSettingValue'),
            );
        } else {
            // No further action required
        }

        context.valuesToMask.push(context.newStorageConnectionSettingValue as string);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newStorageConnectionSettingValue;
    }
}
