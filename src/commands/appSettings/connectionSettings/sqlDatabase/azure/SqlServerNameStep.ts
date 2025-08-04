/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SqlManagementClient } from '@azure/arm-sql';
import { AzureWizardPromptStep, validationUtils } from '@microsoft/vscode-azext-utils';
import { invalidLowerCaseAlphanumericWithHyphens } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createSqlClient } from '../../../../../utils/azureClients';
import { validateUtils } from '../../../../../utils/validateUtils';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';

export class SqlServerNameStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private client: SqlManagementClient;

    public async prompt(context: T): Promise<void> {
        this.client = await createSqlClient(context);

        context.newSqlServerName = (await context.ui.showInputBox({
            prompt: localize('sqlServerNamePrompt', 'Provide a new SQL server name.'),
            validateInput: this.validateInput,
            asyncValidationTask: (name: string) => this.isNameAvailable(name)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlServerName;
    }

    private async validateInput(name: string = ''): Promise<string | undefined> {
        name = name.trim();

        const rc: validationUtils.RangeConstraints = { upperLimitIncl: 63 };
        if (!validationUtils.hasValidCharLength(name, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
        }
        if (!validateUtils.isLowerCaseAlphanumericWithHypens(name)) {
            return invalidLowerCaseAlphanumericWithHyphens;
        }
        return undefined;
    }

    private async isNameAvailable(name: string = ''): Promise<string | undefined> {
        name = name.trim();

        const isAvailable = (await this.client.servers.checkNameAvailability({ name, type: "Microsoft.Sql/servers" })).available;
        if (!isAvailable) {
            return localize('sqlServerExists', 'A SQL server with the name "{0}" already exists.', name);
        }
        return undefined;
    }
}
