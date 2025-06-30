/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, validationUtils } from '@microsoft/vscode-azext-utils';
import { ConnectionType } from '../../../../../constants';
import { localize } from '../../../../../localize';
import { type ISqlDatabaseConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';

export class SqlDbConnectionCustomPromptStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newSQLStorageConnectionSettingValue = (await context.ui.showInputBox({
            prompt: localize('customSqlConnectionPrompt', 'Provide a SQL connection string.'),
            validateInput: this.validateInput,
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newSQLStorageConnectionSettingValue && context.sqlDbConnectionType === ConnectionType.Custom;
    }

    private validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';

        if (!validationUtils.hasValidCharLength(name)) {
            return validationUtils.getInvalidCharLengthMessage();
        }
        return undefined;
    }
}
