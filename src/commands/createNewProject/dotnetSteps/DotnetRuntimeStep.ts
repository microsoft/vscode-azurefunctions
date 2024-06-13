/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { FuncVersion, promptForFuncVersion } from "../../../FuncVersion";
import { hiddenStacksSetting } from "../../../constants";
import { localize } from "../../../localize";
import { cliFeedUtils } from "../../../utils/cliFeedUtils";
import { dotnetUtils } from "../../../utils/dotnetUtils";
import { getWorkspaceSetting } from "../../../vsCodeConfig/settings";
import { type IProjectWizardContext } from "../IProjectWizardContext";

export class DotnetRuntimeStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public static async createStep(context: IProjectWizardContext): Promise<DotnetRuntimeStep> {
        if (context.targetFramework) {
            context.targetFramework = typeof context.targetFramework === 'string' ? [context.targetFramework] : context.targetFramework;
            const runtimes = (await getRuntimes(context))
            // if a targetFramework was provided from createNewProject
            const filteredRuntimes = runtimes.filter(runtime => context.targetFramework?.includes(runtime.targetFramework));
            let workerRuntime: cliFeedUtils.IWorkerRuntime | undefined = undefined;
            if (filteredRuntimes.length > 1) {
                const placeHolder: string = localize('selectWorkerRuntime', 'Select a .NET runtime');
                workerRuntime = (await context.ui.showQuickPick(new DotnetRuntimeStep().getPicks(context, filteredRuntimes), { placeHolder })).data;
            } else if (filteredRuntimes.length === 1) {
                workerRuntime = filteredRuntimes[0];
            }

            if (!workerRuntime) {
                throw new Error(localize('unknownFramework', 'Unrecognized target frameworks: "{0}". Available frameworks: {1}.',
                    context.targetFramework.map(tf => `"${tf}"`).join(', '),
                    runtimes.map(rt => `"${rt.targetFramework}"`).join(', ')));
            }
            setWorkerRuntime(context, workerRuntime);
        }

        return new DotnetRuntimeStep();
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        const placeHolder: string = localize('selectWorkerRuntime', 'Select a .NET runtime');
        let result: cliFeedUtils.IWorkerRuntime | undefined;
        while (true) {
            result = (await context.ui.showQuickPick(this.getPicks(context), { placeHolder })).data;
            if (!result) {
                context.version = await promptForFuncVersion(context);
            } else {
                break;
            }
        }

        setWorkerRuntime(context, result);
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return !context.workerRuntime;
    }

    private async getPicks(context: IProjectWizardContext, runtimes?: cliFeedUtils.IWorkerRuntime[]): Promise<IAzureQuickPickItem<cliFeedUtils.IWorkerRuntime | undefined>[]> {
        if (!runtimes) {
            runtimes = await getRuntimes(context);
        }

        const picks: IAzureQuickPickItem<cliFeedUtils.IWorkerRuntime | undefined>[] = [];
        for (const runtime of runtimes) {
            picks.push({
                label: runtime.displayInfo.displayName,
                description: runtime.displayInfo.description,
                data: runtime
            });
        }
        return picks;
    }
}

async function getRuntimes(context: IProjectWizardContext): Promise<cliFeedUtils.IWorkerRuntime[]> {
    const funcRelease = await cliFeedUtils.getRelease(context, await cliFeedUtils.getLatestVersion(context, context.version));
    let runtimes = await getReleaseRuntimes(funcRelease);
    if (context.version === FuncVersion.v4) {
        try {
            const inProcessRelease = await cliFeedUtils.getRelease(context, await cliFeedUtils.getLatestReleaseVersionForMajorVersion(context, '0'));
            const inProcessRuntimes = await getReleaseRuntimes(inProcessRelease);
            if (inProcessRuntimes.length > 0) {
                runtimes = runtimes.concat(inProcessRuntimes);
            }
        } catch (error) {
            // ignore this error - it just means there are no in-process runtimes we need to add
        }
    }
    if (runtimes.length === 0) {
        throw new Error('Internal error: No .NET worker runtimes found.');
    }
    return runtimes;
}

async function getReleaseRuntimes(release: cliFeedUtils.IRelease): Promise<cliFeedUtils.IWorkerRuntime[]> {
    const showHiddenStacks = getWorkspaceSetting<boolean>(hiddenStacksSetting);
    const runtimes = Object.values(release.workerRuntimes.dotnet).filter(r => !r.displayInfo.hidden || showHiddenStacks);
    return runtimes;
}

function setWorkerRuntime(context: IProjectWizardContext, runtime: cliFeedUtils.IWorkerRuntime): void {
    context.workerRuntime = runtime;
    context.projectTemplateKey = dotnetUtils.getTemplateKeyFromFeedEntry(runtime);
}
