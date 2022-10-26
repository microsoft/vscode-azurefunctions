/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { invalidLength, localize } from '../../../../localize';
import { validateUtils } from '../../../../utils/validateUtils';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/ISqlDatabaseConnectionWizardContext';

export class SqlServerPasswordAuthStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public constructor(private readonly _suppressPasswordConfirm?: boolean) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        while (true) {
            const entryOne: string = (await context.ui.showInputBox({
                prompt: localize('sqlServerPasswordPrompt', 'Enter an admin password for the SQL server.'),
                password: true,
                validateInput: (value: string | undefined) => this._validateInput(context, value)
            })).trim();

            if (this._suppressPasswordConfirm) {
                context.newSqlAdminPassword = entryOne;
                break;
            }

            const entryTwo: string = (await context.ui.showInputBox({
                prompt: localize('sqlServerPasswordConfirm', 'Enter your admin password again to confirm.'),
                password: true,
                validateInput: (value: string | undefined) => this._validateInput(context, value)
            })).trim();

            if (entryOne === entryTwo) {
                context.newSqlAdminPassword = entryTwo;
                break;
            } else {
                context.ui.showWarningMessage(localize('confirmationPasswordMismatch', 'The confirmation password you entered did not match your original entry.'));
            }
        }

        context.valuesToMask.push(nonNullProp(context, 'newSqlAdminPassword'));
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlAdminPassword && !!context.newSqlAdminUsername;
    }

    private _validateInput(context: T, password: string | undefined): string | undefined {
        const login: string = nonNullProp(context, 'newSqlAdminUsername');
        password = password ? password.trim() : '';

        if (!validateUtils.isValidLength(password, 8, 128)) {
            return invalidLength('8', '128');
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
