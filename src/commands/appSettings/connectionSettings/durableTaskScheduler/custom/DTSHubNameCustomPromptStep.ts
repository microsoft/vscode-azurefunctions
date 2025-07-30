/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, validationUtils } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../../localize';
import { type IDTSConnectionWizardContext } from '../IDTSConnectionWizardContext';

export class DTSHubNameCustomPromptStep<T extends IDTSConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newDTSHubConnectionSettingValue = (await context.ui.showInputBox({
            prompt: localize('customDTSConnectionPrompt', 'Provide the custom DTS hub name.'),
            value: context.suggestedDTSHubNameLocalSettings,
            validateInput: (value: string) => this.validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newDTSHubConnectionSettingValue;
    }

    private validateInput(name: string): string | undefined {
        name = name.trim();

        if (!validationUtils.hasValidCharLength(name)) {
            return validationUtils.getInvalidCharLengthMessage();
        }
        return undefined;
    }
}
