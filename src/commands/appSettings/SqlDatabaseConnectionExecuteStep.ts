/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { ConnectionKey, ConnectionType } from '../../constants';
import { MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { getSqlDatabaseConnectionString } from '../../utils/azure';
import { ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';

export class SqlDatabaseConnectionExecuteStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 240;

    public constructor(private _setConnectionForDeploy?: boolean) {
        super();
    }

    public async execute(context: T): Promise<void> {
        let value: string;

        if (context.sqlDbConnectionType === ConnectionType.Azure) {
            value = (await getSqlDatabaseConnectionString(context)).connectionString;
        } else {
            value = nonNullProp(context, 'nonAzureSqlConnection');
        }

        if (this._setConnectionForDeploy) {
            context.sqlDbConnectionForDeploy = value;
        } else {
            await setLocalAppSetting(context, context.projectPath, ConnectionKey.SQL, value, MismatchBehavior.Overwrite);
        }
    }

    public shouldExecute(context: T): boolean {
        return !!context.sqlDbConnectionType && context.sqlDbConnectionType !== ConnectionType.None;
    }
}
