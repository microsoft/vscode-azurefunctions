/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { invalidAlphanumericWithHyphens, invalidLength, localize } from '../../../../localize';
import { validateUtils } from '../../../../utils/validateUtils';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/ISqlDatabaseConnectionWizardContext';

export class SqlServerUsernameAuthStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newSqlAdminUsername = (await context.ui.showInputBox({
            prompt: localize('sqlServerUsernamePrompt', 'Enter an admin username for the new SQL server.'),
            validateInput: (value: string | undefined) => this._validateInput(value)
        })).trim();

        context.valuesToMask.push(nonNullProp(context, 'newSqlAdminUsername'));
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlAdminUsername;
    }

    private _validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name)) {
            return invalidLength();
        }
        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }

        return undefined;
    }
}
