/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageAccountWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { ConnectionKey, ConnectionType, localStorageEmulatorConnectionString } from '../../constants';
import { MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { getStorageConnectionString } from '../../utils/azure';
import { IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

// Todo in next PR: Refactor and inherit use from SetConnectionSettingBaseStep & remove _setConnectionForDeploy
export class AzureWebJobsStorageExecuteStep<T extends IAzureWebJobsStorageWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 230;

    public constructor(private readonly _setConnectionForDeploy?: boolean) {
        super();
    }

    public async execute(context: T): Promise<void> {
        let value: string;

        // 'NonAzure' will represent 'Emulator' in this flow
        if (context.azureWebJobsStorageType === ConnectionType.NonAzure) {
            value = localStorageEmulatorConnectionString;
        } else {
            value = (await getStorageConnectionString(<IStorageAccountWizardContext>context)).connectionString;
        }

        if (this._setConnectionForDeploy) {
            context.azureWebJobsRemoteConnection = value;
        } else {
            await setLocalAppSetting(context, context.projectPath, ConnectionKey.Storage, value, MismatchBehavior.Overwrite);
        }
    }

    public shouldExecute(context: T): boolean {
        return !!context.azureWebJobsStorageType && context.azureWebJobsStorageType !== ConnectionType.None;
    }
}
