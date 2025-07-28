/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../../localize';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';

export class SqlDatabaseGetConnectionStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 235;

    public async execute(context: T): Promise<void> {
        const serverName: string = nonNullValueAndProp(context.sqlServer, 'name');
        const dbName: string = nonNullValueAndProp(context.sqlDatabase, 'name');
        const username: string | undefined = context.sqlServer?.administratorLogin;

        if (!username) {
            throw new Error(localize('unableToDetermineSqlConnection', 'Unable to locate SQL server\'s admin user. Add these credentials to your resource to proceed.'));
        }

        let password: string | undefined = context.newSqlAdminPassword;  // password is never returned back to us on the sqlServer object
        if (!password) {
            password = (await context.ui.showInputBox({
                prompt: localize('sqlPasswordPrompt', 'Please enter your SQL server\'s admin password.'),
                password: true
            })).trim();
        }

        context.newSQLStorageConnectionSettingValue = `Server=${serverName}.database.windows.net,1433;Database=${dbName};User=${username};Password=${password}`;
    }

    public shouldExecute(context: T): boolean {
        return !context.newSQLStorageConnectionSettingValue;
    }
}
