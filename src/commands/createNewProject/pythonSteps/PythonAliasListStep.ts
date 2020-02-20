/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { getGlobalSetting } from "../../../vsCodeConfig/settings";
import { EnterPythonAliasStep } from "./EnterPythonAliasStep";
import { IPythonVenvWizardContext } from "./IPythonVenvWizardContext";
import { getPythonVersion, getSupportedPythonVersions, isSupportedPythonVersion } from './pythonVersion';

export class PythonAliasListStep extends AzureWizardPromptStep<IPythonVenvWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(context: IPythonVenvWizardContext): Promise<void> {
        const placeHolder: string = localize('selectAlias', 'Select a Python interpreter to create a virtual environment');
        const result: string | boolean = (await ext.ui.showQuickPick(getPicks(context), { placeHolder })).data;
        if (typeof result === 'string') {
            context.pythonAlias = result;
            context.telemetry.properties.pythonAliasBehavior = 'selectAlias';
        } else {
            context.manuallyEnterAlias = result;
            context.telemetry.properties.pythonAliasBehavior = result ? 'enterAlias' : 'skipVenv';
        }
    }

    public shouldPrompt(context: IPythonVenvWizardContext): boolean {
        return !context.useExistingVenv && !context.pythonAlias;
    }

    public async getSubWizard(context: IPythonVenvWizardContext): Promise<IWizardOptions<IPythonVenvWizardContext> | undefined> {
        if (context.manuallyEnterAlias) {
            return {
                promptSteps: [new EnterPythonAliasStep()]
            };
        } else {
            return undefined;
        }
    }
}

async function getPicks(context: IPythonVenvWizardContext): Promise<IAzureQuickPickItem<string | boolean>[]> {
    const supportedVersions: string[] = await getSupportedPythonVersions();

    const aliasesToTry: string[] = ['python3', 'python', 'py'];
    for (const version of supportedVersions) {
        aliasesToTry.push(`python${version}`, `py -${version}`);
    }

    const globalPythonPathSetting: string | undefined = getGlobalSetting('pythonPath', 'python');
    if (globalPythonPathSetting) {
        aliasesToTry.unshift(globalPythonPathSetting);
    }

    const picks: IAzureQuickPickItem<string | boolean>[] = [];
    const versions: string[] = [];
    for (const alias of aliasesToTry) {
        let version: string;
        try {
            version = await getPythonVersion(alias);
        } catch {
            continue;
        }

        if (isSupportedPythonVersion(supportedVersions, version) && !versions.some(v => v === version)) {
            picks.push({
                label: alias,
                description: version,
                data: alias
            });
            versions.push(version);
        }
    }

    context.telemetry.properties.detectedPythonVersions = versions.join(',');

    picks.push({ label: localize('enterAlias', '$(keyboard) Manually enter Python interpreter or full path'), data: true });

    if (!context.suppressSkipVenv) {
        picks.push({ label: localize('skipVenv', '$(circle-slash) Skip virtual environment'), data: false, suppressPersistence: true });
    }

    return picks;
}
