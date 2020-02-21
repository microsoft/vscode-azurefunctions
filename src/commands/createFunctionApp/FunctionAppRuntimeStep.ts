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
        } else if (/^powershell/i.test(context.newSiteRuntime)) {
            context.newSiteOS = WebsiteOS.windows;
        } else if (/^java/i.test(context.newSiteRuntime) && context.version === FuncVersion.v2) {
            context.newSiteOS = WebsiteOS.windows; // v1 doesn't support java at all. v2 is windows-only. v3+ supports both OS's.
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

        if (context.version === FuncVersion.v1) {
            // v1 doesn't need a version in `data`
            picks.push({ label: 'Node.js 6', data: 'node' });
            picks.push({ label: '.NET Framework 4.7', data: 'dotnet' });
        } else {
            if (context.version !== FuncVersion.v2) {
                picks.push({ label: 'Node.js 12', data: 'node|12' });
            }
            picks.push({ label: 'Node.js 10', data: 'node|10' });
            if (context.version === FuncVersion.v2) {
                picks.push({ label: 'Node.js 8', data: 'node|8' });
            }

            if (context.version === FuncVersion.v2) {
                picks.push({ label: '.NET Core 2.2', data: 'dotnet|2.2' });
            } else {
                picks.push({ label: '.NET Core 3.1', data: 'dotnet|3.1' });
            }

            if (context.newSiteOS !== WebsiteOS.windows) {
                if (context.version !== FuncVersion.v2) {
                    picks.push({ label: 'Python 3.8', data: 'python|3.8' });
                }
                picks.push({ label: 'Python 3.7', data: 'python|3.7' });
                picks.push({ label: 'Python 3.6', data: 'python|3.6' });
            }

            if (context.newSiteOS !== WebsiteOS.linux) {
                picks.push({ label: 'PowerShell Core 6', data: 'powershell|6' });
            }

            // v1 doesn't support java at all. v2 is windows-only. v3+ supports both OS's.
            if (context.version !== FuncVersion.v2 || context.newSiteOS !== WebsiteOS.linux) {
                picks.push({ label: 'Java 8', data: 'java|8' });
            }
        }

        const runtimeFilter: string | undefined = context.runtimeFilter;
        return runtimeFilter ? picks.filter(r => r.data.startsWith(runtimeFilter)) : picks;
    }
}
