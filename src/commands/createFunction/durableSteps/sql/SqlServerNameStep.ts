/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SqlManagementClient } from '@azure/arm-sql';
import { AzureWizardPromptStep, ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { getInvalidLengthMessage, invalidLowerCaseAlphanumericWithHyphens } from '../../../../constants-nls';
import { localize } from '../../../../localize';
import { createSqlClient } from '../../../../utils/azureClients';
import { validateUtils } from '../../../../utils/validateUtils';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/connectionSettings/sqlDatabase/ISqlDatabaseConnectionWizardContext';

export class SqlServerNameStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private _client: SqlManagementClient;

    public async prompt(context: T): Promise<void> {
        this._client = await createSqlClient(<T & ISubscriptionContext>context);

        context.newSqlServerName = (await context.ui.showInputBox({
            prompt: localize('sqlServerNamePrompt', 'Provide a SQL server name.'),
            validateInput: (value: string | undefined) => this.validateInput(value),
            asyncValidationTask: (value: string) => this.isNameAvailable(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlServerName;
    }

    private async validateInput(name: string | undefined): Promise<string | undefined> {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name, 1, 63)) {
            return getInvalidLengthMessage(1, 63);
        }
        if (!validateUtils.isLowerCaseAlphanumericWithHypens(name)) {
            return invalidLowerCaseAlphanumericWithHyphens;
        }
        return undefined;
    }

    private async isNameAvailable(name: string): Promise<string | undefined> {
        name = name.trim();

        const isAvailable = (await this._client.servers.checkNameAvailability({ name, type: "Microsoft.Sql/servers" })).available;
        if (!isAvailable) {
            return localize('sqlServerExists', 'A SQL server with the name "{0}" already exists.', name);
        }
        return undefined;
    }
}
