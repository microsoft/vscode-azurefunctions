/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAppServiceWizardContext, WebsiteOS } from 'vscode-azureappservice';
import { AzureWizardPromptStep, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';

export class FunctionAppRuntimeStep extends AzureWizardPromptStep<IAppServiceWizardContext> {
    public async prompt(wizardContext: IAppServiceWizardContext): Promise<void> {
        const runtimeItems: IAzureQuickPickItem<string>[] = [
            { label: 'JavaScript', data: 'node' },
            { label: '.NET', data: 'dotnet' }
        ];

        if (wizardContext.newSiteOS === WebsiteOS.linux) {
            runtimeItems.push({ label: 'Python', data: 'python' });
        } else {
            runtimeItems.push({ label: 'Java', data: 'java' });
            runtimeItems.push({ label: 'PowerShell', data: 'powershell' });
        }

        wizardContext.newSiteRuntime = (await ext.ui.showQuickPick(runtimeItems, { placeHolder: 'Select a runtime for your new app.' })).data;
    }

    public shouldPrompt(wizardContext: IAppServiceWizardContext): boolean {
        return !wizardContext.newSiteRuntime;
    }
}
