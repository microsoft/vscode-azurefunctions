/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { IBindingWizardContext } from '../IBindingWizardContext';

export class LocalAppSettingValueStep extends AzureWizardPromptStep<IBindingWizardContext> {
    private readonly _key: string;

    public constructor(key: string) {
        super();
        this._key = key;
    }

    public async prompt(context: IBindingWizardContext): Promise<void> {
        context[this._key] = await ext.ui.showInputBox({
            placeHolder: localize('appSettingValuePlaceholder', 'App setting value'),
            prompt: localize('appSettingValuePrompt', 'Provide a connection string')
        });
    }

    public shouldPrompt(context: IBindingWizardContext): boolean {
        return !context[this._key];
    }
}
