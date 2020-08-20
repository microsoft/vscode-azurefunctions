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

export class FunctionAppStackStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
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

                    function getDescription(): string | undefined {
                        return majorVersion.isPreview ? localize('preview', '(Preview)') : majorVersion.isDeprecated ? localize('deprecated', '(Deprecated)') : undefined;
                    }

                    let data: INewSiteStacks;
                    if (existingPick) {
                        data = existingPick.data;
                        existingPick.description = existingPick.description || getDescription();
                    } else {
                        // Custom handlers are a bit weird with the labeling because there's no "version"
                        const label: string = stack.name.toLowerCase() === 'custom' ? majorVersion.displayVersion : `${stack.display} ${majorVersion.displayVersion}`;
                        data = { name: stack.name, displayVersion: majorVersion.displayVersion, };
                        picks.push({
                            label,
                            description: getDescription(),
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
        // Move all picks with a description to the bottom (This should be any preview/deprecated stacks)
        if (pick1.description && !pick2.description) {
            return 1;
        } else if (!pick1.description && pick2.description) {
            return -1;
        } else if (pick1.data.name === pick2.data.name) {
            // If the stack is the same, sort by version
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
