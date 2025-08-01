/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, validationUtils } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../../localize';
import { type IDTSConnectionWizardContext } from '../IDTSConnectionWizardContext';

export class DTSConnectionCustomPromptStep<T extends IDTSConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newDTSConnectionSettingValue = (await context.ui.showInputBox({
            prompt: localize('customDTSConnectionPrompt', 'Provide a custom DTS connection string.'),
            validateInput: (value: string | undefined) => this.validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newDTSConnectionSettingValue;
    }

    private validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';
        if (!validationUtils.hasValidCharLength(name)) {
            return validationUtils.getInvalidCharLengthMessage();
        }
        return undefined;
    }
}
