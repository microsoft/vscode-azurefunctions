/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type IBindingWizardContext } from './IBindingWizardContext';

export class BindingDirectionStep extends AzureWizardPromptStep<IBindingWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(context: IBindingWizardContext): Promise<void> {
        const placeHolder: string = localize('selectDirection', 'Select binding direction');
        const picks: IAzureQuickPickItem<string>[] = [
            { label: 'in', data: 'in' },
            { label: 'out', data: 'out' }
        ];
        context.bindingDirection = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public shouldPrompt(context: IBindingWizardContext): boolean {
        return !context.bindingDirection;
    }
}
