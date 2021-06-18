/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from "vscode-azureextensionui";
import { hiddenStacksSetting } from "../../../constants";
import { localize } from "../../../localize";
import { cliFeedUtils } from "../../../utils/cliFeedUtils";
import { dotnetUtils } from "../../../utils/dotnetUtils";
import { getWorkspaceSetting } from "../../../vsCodeConfig/settings";
import { IProjectWizardContext } from "../IProjectWizardContext";

export class DotnetRuntimeStep extends AzureWizardPromptStep<IProjectWizardContext> {
    private _runtimes: cliFeedUtils.IWorkerRuntime[];

    private constructor(runtimes: cliFeedUtils.IWorkerRuntime[]) {
        super();
        this._runtimes = runtimes;
    }

    public static async createStep(context: IProjectWizardContext): Promise<DotnetRuntimeStep> {
        const funcRelease = await cliFeedUtils.getRelease(await cliFeedUtils.getLatestVersion(context, context.version));
        const showHiddenStacks = getWorkspaceSetting<boolean>(hiddenStacksSetting);
        const runtimes = Object.values(funcRelease.workerRuntimes.dotnet).filter(r => !r.displayInfo.hidden || showHiddenStacks);
        if (runtimes.length === 0) {
            throw new Error('Internal error: No .NET worker runtimes found.')
        } else if (context.targetFramework) {
            // if a targetFramework was provided from createNewProject
            const workerRuntime = runtimes.find(runtime => runtime.targetFramework === context.targetFramework);
            if (!workerRuntime) {
                throw new Error(localize('unknownFramework', 'Unrecognized target framework "{0}". Available frameworks: {1}.', context.targetFramework,
                    runtimes.map(rt => `"${rt.targetFramework}"`).join(', ')));
            }
            setWorkerRuntime(context, workerRuntime);
        } else if (runtimes.length === 1) {
            // No need to prompt if it only supports one
            setWorkerRuntime(context, runtimes[0]);
        }

        return new DotnetRuntimeStep(runtimes);
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<cliFeedUtils.IWorkerRuntime>[] = [];
        for (const runtime of this._runtimes) {
            picks.push({
                label: runtime.displayInfo.displayName,
                description: runtime.displayInfo.description,
                data: runtime
            });
        }

        const placeHolder: string = localize('selectWorkerRuntime', 'Select a .NET runtime');
        const runtime = (await context.ui.showQuickPick(picks, { placeHolder })).data;
        setWorkerRuntime(context, runtime);
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return !context.workerRuntime;
    }
}

function setWorkerRuntime(context: IProjectWizardContext, runtime: cliFeedUtils.IWorkerRuntime): void {
    context.workerRuntime = runtime;
    context.projectTemplateKey = dotnetUtils.getTemplateKeyFromFeedEntry(runtime);
}
