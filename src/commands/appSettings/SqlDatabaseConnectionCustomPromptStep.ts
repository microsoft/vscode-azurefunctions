import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { ConnectionType } from '../../constants';
import { invalidLength, localize } from '../../localize';
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
        return !context.nonAzureSqlConnection && context.sqlDbConnectionType === ConnectionType.NonAzure;
    }

    private _validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name)) {
            return invalidLength();
        }

        return undefined;
    }
}
