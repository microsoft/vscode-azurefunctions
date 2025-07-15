/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from '@microsoft/vscode-azext-utils';
import { ConnectionKey, ConnectionType } from '../../../../constants';
import { SetConnectionSettingStepBase } from '../SetConnectionSettingStepBase';
import { getSqlDatabaseConnectionString } from '../getLocalConnectionSetting';
import { type ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';

export class SqlDatabaseConnectionExecuteStep<T extends ISqlDatabaseConnectionWizardContext> extends SetConnectionSettingStepBase<T> {
    public priority: number = 250;
    public debugDeploySetting: ConnectionKey = ConnectionKey.SQL;

    public async execute(context: T): Promise<void> {
        let value: string;

        if (context.sqlDbConnectionType === ConnectionType.Azure) {
            value = (await getSqlDatabaseConnectionString(context)).connectionString;
        } else {
            value = nonNullProp(context, 'customSqlConnection');
        }

        await this.setConnectionSetting(context, value);
    }

    public shouldExecute(context: T): boolean {
        return !!context.sqlDbConnectionType;
    }
}
