/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { IProjectWizardContext, OpenBehavior } from './IProjectWizardContext';

export class OpenBehaviorStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public async prompt(wizardContext: IProjectWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<OpenBehavior>[] = [
            { label: localize('OpenInCurrentWindow', 'Open in current window'), data: 'OpenInCurrentWindow' },
            { label: localize('OpenInNewWindow', 'Open in new window'), data: 'OpenInNewWindow' },
            { label: localize('AddToWorkspace', 'Add to workspace'), data: 'AddToWorkspace' }
        ];

        const placeHolder: string = localize('selectOpenBehavior', 'Select how you would like to open your project');
        wizardContext.openBehavior = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public shouldPrompt(wizardContext: IProjectWizardContext): boolean {
        return !wizardContext.openBehavior && wizardContext.openBehavior !== 'AlreadyOpen' && wizardContext.openBehavior !== 'DontOpen';
    }
}
