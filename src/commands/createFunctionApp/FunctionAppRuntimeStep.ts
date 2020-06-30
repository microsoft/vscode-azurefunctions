/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { WebsiteOS } from 'vscode-azureappservice';
import { AzureWizardPromptStep, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getLinuxFunctionsStacks, getWindowsFunctionsStacks, IFunctionStack } from './functionStacks';
import { IFunctionAppWizardContext, INewSiteStacks } from './IFunctionAppWizardContext';

/**
 * Todo rename this file/class to `FunctionAppStackStep` after PR review
 */
export class FunctionAppRuntimeStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<INewSiteStacks>[] = this.getPicks(context);
        const placeHolder: string = localize('selectRuntime', 'Select a runtime stack');
        context.newSiteStack = (await ext.ui.showQuickPick(picks, { placeHolder })).data;

        if (!context.newSiteStack.linux) {
            context.newSiteOS = WebsiteOS.windows;
        } else if (!context.newSiteStack.windows) {
            context.newSiteOS = WebsiteOS.linux;
        }
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        if (context.newSiteRuntime) {
            return false;
        } else if (context.stackFilter) {
            const picks: IAzureQuickPickItem<INewSiteStacks>[] = this.getPicks(context);
            if (picks.length === 1) {
                // This needs to be set in `shouldPrompt` instead of `prompt`, otherwise the back button won't work
                context.newSiteStack = picks[0].data;
                return false;
            }
        }

        return true;
    }

    private getPicks(context: IFunctionAppWizardContext): IAzureQuickPickItem<INewSiteStacks>[] {
        const picks: IAzureQuickPickItem<INewSiteStacks>[] = [];

        const allStacks: [WebsiteOS, IFunctionStack[]][] = [[WebsiteOS.windows, getWindowsFunctionsStacks()], [WebsiteOS.linux, getLinuxFunctionsStacks()]];

        for (const [os, stacks] of allStacks) {
            for (const stack of stacks) {
                if (context.stackFilter && context.stackFilter?.toLowerCase() !== stack.name.toLowerCase()) {
                    continue;
                }

                for (const majorVersion of stack.majorVersions) {
                    if (!majorVersion.supportedFunctionsExtensionVersions.includes(context.version) || majorVersion.isHidden) {
                        continue;
                    }

                    const existingPick: IAzureQuickPickItem<INewSiteStacks> | undefined = picks.find(r => r.data.name === stack.name && r.data.displayVersion === majorVersion.displayVersion);

                    let data: INewSiteStacks;
                    if (existingPick) {
                        data = existingPick.data;
                    } else {
                        data = { name: stack.name, displayVersion: majorVersion.displayVersion, };
                        picks.push({
                            label: `${stack.display} ${majorVersion.displayVersion}`,
                            data
                        });
                    }
                    data[os] = { ...majorVersion, name: stack.name };
                }
            }
        }

        return picks.sort(sortStackPicks);
    }
}

function sortStackPicks(pick1: IAzureQuickPickItem<INewSiteStacks>, pick2: IAzureQuickPickItem<INewSiteStacks>): number {
    try {
        if (pick1.data.name === pick2.data.name) {
            const version1: semver.SemVer | null = semver.coerce(pick1.data.displayVersion);
            const version2: semver.SemVer | null = semver.coerce(pick2.data.displayVersion);
            if (version1 && version2) {
                return semver.rcompare(version1, version2);
            }
        }
    } catch (e) {
        // ignore
    }

    return 0; // use default sorting
}
