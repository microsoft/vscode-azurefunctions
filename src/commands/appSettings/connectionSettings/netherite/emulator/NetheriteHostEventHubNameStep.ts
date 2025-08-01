/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, validationUtils } from '@microsoft/vscode-azext-utils';
import { invalidAlphanumericWithHyphens } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { validateUtils } from '../../../../../utils/validateUtils';
import { type INetheriteConnectionWizardContext } from '../INetheriteConnectionWizardContext';

export class NetheriteHostEventHubNameStep<T extends INetheriteConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newEventHubConnectionSettingValue = (await context.ui.showInputBox({
            prompt: localize('eventHubNamePrompt', 'Enter a name for the event hub.'),
            value: "MyTaskHub", // This is the default used in the ms learn docs
            validateInput: this.validateInput,
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newEventHubConnectionSettingValue;
    }

    private validateInput(name: string = ''): string | undefined {
        name = name.trim();

        const rc: validationUtils.RangeConstraints = { upperLimitIncl: 256 };
        if (!validationUtils.hasValidCharLength(name, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
        }

        if (!validateUtils.isAlphanumericWithHypens(name)) {
            return invalidAlphanumericWithHyphens;
        }

        return undefined;
    }
}
