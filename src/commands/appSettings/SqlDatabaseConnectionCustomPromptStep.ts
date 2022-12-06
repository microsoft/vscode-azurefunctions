/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { ConnectionType } from '../../constants';
import { getInvalidLengthMessage } from '../../constants-nls';
import { localize } from '../../localize';
import { validateUtils } from '../../utils/validateUtils';
import { ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';

export class SqlDatabaseConnectionCustomPromptStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.nonAzureSqlConnection = (await context.ui.showInputBox({
            prompt: localize('customSqlConnectionPrompt', 'Enter a custom SQL connection string.'),
            validateInput: (value: string | undefined) => this._validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        // 'NonAzure' represents any local or remote custom SQL connection that is not hosted through Azure
        return !context.nonAzureSqlConnection && context.sqlDbConnectionType === ConnectionType.NonAzure;
    }

    private _validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name)) {
            return getInvalidLengthMessage();
        }

        return undefined;
    }
}
