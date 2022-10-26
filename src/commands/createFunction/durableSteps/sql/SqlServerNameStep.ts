/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SqlManagementClient } from '@azure/arm-sql';
import { delay } from '@azure/ms-rest-js';
import { AzureWizardPromptStep, ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { invalidLength, invalidLowerCaseAlphanumericWithHyphens, localize } from '../../../../localize';
import { createSqlClient } from '../../../../utils/azureClients';
import { validateUtils } from '../../../../utils/validateUtils';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/ISqlDatabaseConnectionWizardContext';

export class SqlServerNameStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private _client: SqlManagementClient;

    public async prompt(context: T): Promise<void> {
        this._client = await createSqlClient(<T & ISubscriptionContext>context);

        context.newSqlServerName = (await context.ui.showInputBox({
            prompt: localize('sqlServerNamePrompt', 'Enter a name the new SQL server.'),
            validateInput: async (value: string | undefined) => await this._validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlServerName;
    }

    private async _validateInput(name: string | undefined): Promise<string | undefined> {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name, 1, 63)) {
            return invalidLength('1', '63');
        }
        if (!validateUtils.isLowerCaseAlphanumericWithHypens(name)) {
            return invalidLowerCaseAlphanumericWithHyphens;
        }
        delay(500);

        const isNameAvailable: boolean | undefined = (await this._client.servers.checkNameAvailability({ name, type: "Microsoft.Sql/servers" })).available;
        if (!isNameAvailable) {
            return localize('sqlServerExists', 'The SQL server "{0}" already exists. Please enter a unique name.', name);
        }

        return undefined;
    }
}
