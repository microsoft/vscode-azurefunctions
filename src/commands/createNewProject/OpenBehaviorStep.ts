/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type IProjectWizardContext, type OpenBehavior } from './IProjectWizardContext';

export class OpenBehaviorStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public async prompt(context: IProjectWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<OpenBehavior>[] = [
            { label: localize('OpenInCurrentWindow', 'Open in current window'), data: 'OpenInCurrentWindow' },
            { label: localize('OpenInNewWindow', 'Open in new window'), data: 'OpenInNewWindow' },
            { label: localize('AddToWorkspace', 'Add to workspace'), data: 'AddToWorkspace' }
        ];

        const placeHolder: string = localize('selectOpenBehavior', 'Select how you would like to open your project');
        context.openBehavior = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return !context.openBehavior && context.openBehavior !== 'AlreadyOpen' && context.openBehavior !== 'DontOpen';
    }
}
