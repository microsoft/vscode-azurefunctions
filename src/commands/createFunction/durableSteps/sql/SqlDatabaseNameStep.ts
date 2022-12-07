/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Database, SqlManagementClient } from '@azure/arm-sql';
import { getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, ISubscriptionContext, nonNullProp, nonNullValue } from '@microsoft/vscode-azext-utils';
import { getInvalidLengthMessage, invalidAlphanumericWithHyphens } from '../../../../constants-nls';
import { localize } from '../../../../localize';
import { createSqlClient } from '../../../../utils/azureClients';
import { validateUtils } from '../../../../utils/validateUtils';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/ISqlDatabaseConnectionWizardContext';


export class SqlDatabaseNameStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private _databases: Database[] = [];

    public async prompt(context: T): Promise<void> {
        // If we have a sql server already, then we should check to make sure we don't have a name duplicate down the line
        // If we don't have a sql server yet, then that means we can just take any name that meets basic validation requirements
        if (context.sqlServer) {
            const rgName: string = getResourceGroupFromId(nonNullValue(context.sqlServer?.id));
            const serverName: string = nonNullProp(context.sqlServer, 'name');

            const client: SqlManagementClient = await createSqlClient(<T & ISubscriptionContext>context);
            const dbIterator = client.databases.listByServer(rgName, serverName);
            this._databases = await uiUtils.listAllIterator(dbIterator);
        }

        context.newSqlDatabaseName = (await context.ui.showInputBox({
            prompt: localize('sqlDatabaseNamePrompt', 'Enter a name the new SQL database.'),
            validateInput: (value: string | undefined) => this._validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlDatabaseName;
    }

    private _validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name, 6, 50)) {
            return getInvalidLengthMessage(6, 50);
        }
        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }

        const dbExists: boolean = this._databases.some((db) => {
            return db.name === name;
        });
        if (dbExists) {
            return localize('sqlDatabaseExists', 'The SQL database "{0}" already exists. Please enter a unique name.', name);
        }

        return undefined;
    }
}