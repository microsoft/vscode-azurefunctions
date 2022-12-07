/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { ConnectionKey, ConnectionType } from '../../constants';
import { MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { getSqlDatabaseConnectionString } from '../../utils/azure';
import { ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';

// Todo in next PRs: Refactor and inherit use from SetConnectionSettingBaseStep & remove _setConnectionForDeploy
export class SqlDatabaseConnectionExecuteStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 250;

    public constructor(private readonly _setConnectionForDeploy?: boolean) {
        super();
    }

    public async execute(context: T): Promise<void> {
        let value: string;

        if (context.sqlDbConnectionType === ConnectionType.Azure) {
            value = (await getSqlDatabaseConnectionString(context)).connectionString;
        } else {
            // 'NonAzure' represents any local or remote custom SQL connection that is not hosted through Azure
            value = nonNullProp(context, 'nonAzureSqlConnection');
        }

        if (this._setConnectionForDeploy) {
            context.sqlDbRemoteConnection = value;
        } else {
            await setLocalAppSetting(context, context.projectPath, ConnectionKey.SQL, value, MismatchBehavior.Overwrite);
        }
    }

    public shouldExecute(context: T): boolean {
        return !!context.sqlDbConnectionType && context.sqlDbConnectionType !== ConnectionType.None;
    }
}
