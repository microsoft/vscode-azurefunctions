/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { IBindingWizardContext } from './IBindingWizardContext';

export class BindingDirectionStep extends AzureWizardPromptStep<IBindingWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(wizardContext: IBindingWizardContext): Promise<void> {
        const placeHolder: string = localize('selectDirection', 'Select binding direction');
        const picks: IAzureQuickPickItem<string>[] = [
            { label: 'in', data: 'in' },
            { label: 'out', data: 'out' }
        ];
        wizardContext.bindingDirection = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public shouldPrompt(wizardContext: IBindingWizardContext): boolean {
        return !wizardContext.bindingDirection;
    }
}
