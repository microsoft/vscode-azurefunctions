/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { gt, satisfies } from "semver";
import { localize } from "../../../localize";
import { getGlobalSetting } from "../../../vsCodeConfig/settings";
import { EnterPythonAliasStep } from "./EnterPythonAliasStep";
import { type IPythonVenvWizardContext } from "./IPythonVenvWizardContext";
import { getPythonVersion, getSupportedPythonVersions, isSupportedPythonVersion } from './pythonVersion';

export class PythonAliasListStep extends AzureWizardPromptStep<IPythonVenvWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(context: IPythonVenvWizardContext): Promise<void> {


        if (context.externalRuntimeConfig) {
            const installedVersions = await getInstalledPythonVersions(context);
            const matchingVersion = findBestMatchingVersion(context.externalRuntimeConfig.runtimeVersion, installedVersions);

            if (matchingVersion) {
                context.pythonAlias = matchingVersion.alias;
                context.telemetry.properties.pythonAliasBehavior = 'externalRuntimeConfigMatch';
                return;
            } else {
                return;
            }
        }

        const placeHolder: string = localize('selectAlias', 'Select a Python interpreter to create a virtual environment');
        const result: string | boolean = (await context.ui.showQuickPick(getPicks(context), { placeHolder })).data;
        if (typeof result === 'string') {
            context.pythonAlias = result;
            context.telemetry.properties.pythonAliasBehavior = 'selectAlias';
        } else {
            context.manuallyEnterAlias = result;
            context.telemetry.properties.pythonAliasBehavior = result ? 'enterAlias' : 'skipVenv';
        }
    }

    public shouldPrompt(context: IPythonVenvWizardContext): boolean {
        // Skip prompting if external runtime configuration is provided
        return !context.useExistingVenv && !context.pythonAlias;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
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
    const supportedVersions: string[] = await getSupportedPythonVersions(context, context.version);

    const aliasesToTry: string[] = ['python', 'python3', 'py'];
    for (const version of supportedVersions) {
        aliasesToTry.push(`python${version}`, `py -${version}`);
    }

    const globalPythonPathSetting: string | undefined = getGlobalSetting('pythonPath', 'python');
    if (globalPythonPathSetting) {
        aliasesToTry.unshift(globalPythonPathSetting);
    }

    const picks: IAzureQuickPickItem<string | boolean>[] = [];
    const pythonVersions = await getInstalledPythonVersions(context);
    pythonVersions.forEach(pv => picks.push({
        label: pv.alias,
        description: pv.version,
        data: pv.alias
    }));

    picks.push({ label: localize('enterAlias', '$(keyboard) Manually enter Python interpreter or full path'), data: true });

    if (!context.suppressSkipVenv) {
        picks.push({ label: localize('skipVenv', '$(circle-slash) Skip virtual environment'), data: false, suppressPersistence: true });
    }

    return picks;
}

interface InstalledPythonVersion {
    alias: string;
    version: string;
}

// use this method to preselect python version if runtime version is provided externally

async function getInstalledPythonVersions(context: IPythonVenvWizardContext): Promise<InstalledPythonVersion[]> {
    const supportedVersions: string[] = await getSupportedPythonVersions(context, context.version);

    const aliasesToTry: string[] = ['python', 'python3', 'py'];
    for (const version of supportedVersions) {
        aliasesToTry.push(`python${version}`, `py -${version}`);
    }

    const globalPythonPathSetting: string | undefined = getGlobalSetting('pythonPath', 'python');
    if (globalPythonPathSetting) {
        aliasesToTry.unshift(globalPythonPathSetting);
    }

    const versions: InstalledPythonVersion[] = [];
    for (const alias of aliasesToTry) {
        let version: string;
        try {
            version = await getPythonVersion(alias);
        } catch {
            continue;
        }

        if (isSupportedPythonVersion(supportedVersions, version) && !versions.some(v => v.version === version)) {
            versions.push({
                alias,
                version,
            });
        }
    }

    context.telemetry.properties.detectedPythonVersions = versions.join(',');
    return versions;
}

// use semver to find a matching python version
function findMatchingVersion(requestedVersion: string, versions: InstalledPythonVersion[]): InstalledPythonVersion | undefined {
    return versions.find(v => satisfies(v.version, requestedVersion));
}

function findBestMatchingVersion(requestedVersion: string, versions: InstalledPythonVersion[]): InstalledPythonVersion | undefined {
    let matchingVersion = findMatchingVersion(requestedVersion, versions);
    if (!matchingVersion) {
        matchingVersion = versions.reduce((prev, current) => (gt(current.version, prev.version) ? current : prev));
    }
    return matchingVersion;
}
