/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';

export class InputRevalidationStep<T extends IActionContext> extends AzureWizardPromptStep<T> {
    constructor(private readonly _key: string, private readonly _isPassword?: boolean) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        await context.ui.showInputBox({
            prompt: localize('verifyPreviousInput', 'Please confirm by re-entering the previous value.'),
            password: !!this._isPassword,
            validateInput: (value: string | undefined) => this._validateInput(context, value)
        });
    }

    public shouldPrompt(): boolean {
        return true;
    }

    private _validateInput(context: T, value: string | undefined): string | undefined {
        const valueMismatch: string = localize('valueMismatch', 'The new value does not match the original.');
        return (context[this._key] === value?.trim()) ? undefined : valueMismatch;
    }
}
