/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { getInvalidLengthMessage } from '../../../../constants-nls';
import { localize } from '../../../../localize';
import { validateUtils } from '../../../../utils/validateUtils';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/ISqlDatabaseConnectionWizardContext';

export class SqlServerPasswordAuthStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public constructor() {
        super();
    }

    public async prompt(context: T): Promise<void> {
        context.newSqlAdminPassword = (await context.ui.showInputBox({
            prompt: localize('sqlServerPasswordPrompt', 'Provide an admin password for the SQL server.'),
            password: true,
            validateInput: (value: string | undefined) => this._validateInput(context, value)
        })).trim();

        context.valuesToMask.push(nonNullProp(context, 'newSqlAdminPassword'));
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlAdminPassword;
    }

    private _validateInput(context: T, password: string | undefined): string | undefined {
        const login: string = nonNullProp(context, 'newSqlAdminUsername');
        password = password ? password.trim() : '';

        if (!validateUtils.isValidLength(password, 8, 128)) {
            return getInvalidLengthMessage(8, 128);
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
