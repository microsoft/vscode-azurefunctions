/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, validationUtils } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../../localize';
import { validateUtils } from '../../../../../utils/validateUtils';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';

export class SqlServerPasswordAuthStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newSqlAdminPassword = (await context.ui.showInputBox({
            prompt: localize('sqlServerPasswordPrompt', 'Provide an admin password for the SQL server.'),
            password: true,
            validateInput: (value: string | undefined) => this.validateInput(context, value)
        })).trim();

        context.valuesToMask.push(nonNullProp(context, 'newSqlAdminPassword'));
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlAdminPassword;
    }

    private validateInput(context: T, password: string = ''): string | undefined {
        const login: string = nonNullProp(context, 'newSqlAdminUsername');
        password = password.trim();

        const rc: validationUtils.RangeConstraints = { lowerLimitIncl: 8, upperLimitIncl: 128 };
        if (!validationUtils.hasValidCharLength(password, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
        }
        if (!validateUtils.meetsBasePasswordStrength(password)) {
            return localize('invalidPasswordStrength', 'Your password must contain three of the following - uppercase, lowercase, numbers, and symbols.');
        }
        if (validateUtils.passwordOverlapsLogin(password, login)) {
            return localize('passwordOverlapsLogin', 'Your password cannot share 3 or more consecutive characters with your login.');
        }
        return undefined;
    }
}
