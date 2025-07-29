/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Database, type SqlManagementClient } from '@azure/arm-sql';
import { parseAzureResourceId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullValueAndProp, validationUtils } from '@microsoft/vscode-azext-utils';
import { invalidAlphanumericWithHyphens } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createSqlClient } from '../../../../../utils/azureClients';
import { validateUtils } from '../../../../../utils/validateUtils';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';

export class SqlDatabaseNameStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private databases: Database[] = [];

    public async prompt(context: T): Promise<void> {
        // If we have a sql server already, then we should check to make sure we don't have a name duplicate down the line
        // If we don't have a sql server yet, then that means we can just take any name that meets basic validation requirements
        if (context.sqlServer) {
            const client: SqlManagementClient = await createSqlClient(context);
            const parsedResource = parseAzureResourceId(nonNullValueAndProp(context.sqlServer, 'id'));
            this.databases = await uiUtils.listAllIterator(client.databases.listByServer(parsedResource.resourceGroup, parsedResource.resourceName));
        }

        context.newSqlDatabaseName = (await context.ui.showInputBox({
            prompt: localize('sqlDatabaseNamePrompt', 'Provide a SQL database name.'),
            validateInput: (value: string) => this.validateInput(value)
        })).trim();

        context.valuesToMask.push(context.newSqlDatabaseName);
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlDatabaseName;
    }

    private validateInput(name: string = ''): string | undefined {
        name = name.trim();

        const rc: validationUtils.RangeConstraints = { lowerLimitIncl: 6, upperLimitIncl: 50 };
        if (!validationUtils.hasValidCharLength(name, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
        }
        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }

        const dbExists: boolean = this.databases.some((db) => {
            return db.name === name;
        });
        if (dbExists) {
            return localize('sqlDatabaseExists', 'A SQL database with the name "{0}" already exists.', name);
        }
        return undefined;
    }
}
