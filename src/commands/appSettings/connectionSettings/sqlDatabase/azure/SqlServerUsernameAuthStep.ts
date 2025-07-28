/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, validationUtils } from '@microsoft/vscode-azext-utils';
import { invalidAlphanumericWithHyphens } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { validateUtils } from '../../../../../utils/validateUtils';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';

export class SqlServerUsernameAuthStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newSqlAdminUsername = (await context.ui.showInputBox({
            prompt: localize('sqlServerUsernamePrompt', 'Provide an admin username for the SQL server.'),
            validateInput: this.validateInput,
        })).trim();

        context.valuesToMask.push(nonNullProp(context, 'newSqlAdminUsername'));
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSqlAdminUsername;
    }

    private validateInput(name: string = ''): string | undefined {
        name = name.trim();

        if (!validationUtils.hasValidCharLength(name)) {
            return validationUtils.getInvalidCharLengthMessage();
        }
        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }
        return undefined;
    }
}
