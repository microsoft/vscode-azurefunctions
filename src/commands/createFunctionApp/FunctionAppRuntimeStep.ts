/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebsiteOS } from 'vscode-azureappservice';
import { AzureWizardPromptStep, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { IFunctionAppWizardContext } from './IFunctionAppWizardContext';

export class FunctionAppRuntimeStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<string>[] = this.getPicks(context);
        const placeHolder: string = localize('selectRuntime', 'Select a runtime');
        context.newSiteRuntime = (await ext.ui.showQuickPick(picks, { placeHolder })).data;

        if (/^python/i.test(context.newSiteRuntime)) {
            context.newSiteOS = WebsiteOS.linux;
        } else if (/^(powershell|java)/i.test(context.newSiteRuntime)) {
            context.newSiteOS = WebsiteOS.windows;
        }
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        if (context.newSiteRuntime) {
            return false;
        } else if (context.runtimeFilter) {
            const picks: IAzureQuickPickItem<string>[] = this.getPicks(context);
            if (picks.length === 1) {
                // This needs to be set in `shouldPrompt` instead of `prompt`, otherwise the back button won't work
                context.newSiteRuntime = picks[0].data;
                return false;
            }
        }

        return true;
    }

    private getPicks(context: IFunctionAppWizardContext): IAzureQuickPickItem<string>[] {
        const picks: IAzureQuickPickItem<string>[] = [];

        picks.push({ label: '.NET', data: 'dotnet' });

        if (context.version === FuncVersion.v1) {
            picks.unshift({ label: 'Node.js', data: 'node' });
        } else {
            if (context.version === FuncVersion.v2) {
                picks.unshift({ label: 'Node.js 8.x', data: 'node|8' });
            }
            picks.unshift({ label: 'Node.js 10.x', data: 'node|10' });
            if (context.version === FuncVersion.v3) {
                picks.unshift({ label: 'Node.js 12.x', data: 'node|12' });
            }

            if (context.newSiteOS !== WebsiteOS.windows) {
                picks.push({ label: 'Python 3.7.x', data: 'python|3.7' });
                picks.push({ label: 'Python 3.6.x', data: 'python|3.6' });
            }

            if (context.newSiteOS !== WebsiteOS.linux) {
                picks.push({ label: 'Java', data: 'java' });
                picks.push({ label: 'PowerShell', data: 'powershell' });
            }
        }

        const runtimeFilter: string | undefined = context.runtimeFilter;
        return runtimeFilter ? picks.filter(r => r.data.startsWith(runtimeFilter)) : picks;
    }
}
