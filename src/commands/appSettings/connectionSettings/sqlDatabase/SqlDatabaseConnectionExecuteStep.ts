/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from '@microsoft/vscode-azext-utils';
import { ConnectionKey, ConnectionKeyValues, ConnectionType } from '../../../../constants';
import { getSqlDatabaseConnectionString } from '../../../../utils/azure';
import { SetConnectionSettingBaseStep } from '../SetConnectionSettingBaseStep';
import { ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';

export class SqlDatabaseConnectionExecuteStep<T extends ISqlDatabaseConnectionWizardContext> extends SetConnectionSettingBaseStep<T> {
    public priority: number = 250;
    public debugDeploySetting: ConnectionKeyValues = ConnectionKey.SQL;

    public async execute(context: T): Promise<void> {
        let value: string;

        if (context.sqlDbConnectionType === ConnectionType.Azure) {
            value = (await getSqlDatabaseConnectionString(context)).connectionString;
        } else {
            // 'NonAzure' represents any local or remote custom SQL connection that is not hosted through Azure
            value = nonNullProp(context, 'customSqlConnection');
        }

        await this.setConnectionSetting(context, value);
    }

    public shouldExecute(context: T): boolean {
        return !!context.sqlDbConnectionType;
    }
}
