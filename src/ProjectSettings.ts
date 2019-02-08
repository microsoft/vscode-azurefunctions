/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
// tslint:disable-next-line:no-require-imports
import opn = require("opn");
import * as path from 'path';
import { ConfigurationTarget, MessageItem, QuickPickItem, QuickPickOptions, Uri, workspace, WorkspaceConfiguration } from "vscode";
import { DialogResponses, IAzureQuickPickItem, IAzureQuickPickOptions, IAzureUserInput } from 'vscode-azureextensionui';
import { extensionPrefix, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter, templateFilterSetting } from './constants';
import { ext } from './extensionVariables';
import { localize } from "./localize";

const previewDescription: string = localize('previewDescription', '(Preview)');

export async function updateGlobalSetting<T = string>(section: string, value: T, prefix: string = extensionPrefix): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix);
    await projectConfiguration.update(section, value, ConfigurationTarget.Global);
}

export async function updateWorkspaceSetting<T = string>(section: string, value: T, fsPath: string): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(extensionPrefix, Uri.file(fsPath));
    await projectConfiguration.update(section, value);
}

export async function promptForProjectLanguage(ui: IAzureUserInput): Promise<ProjectLanguage> {
    const picks: QuickPickItem[] = [
        { label: ProjectLanguage.JavaScript, description: '' },
        { label: ProjectLanguage.CSharp, description: '' },
        { label: ProjectLanguage.CSharpScript, description: '' },
        { label: ProjectLanguage.FSharpScript, description: '' },
        { label: ProjectLanguage.Bash, description: previewDescription },
        { label: ProjectLanguage.Batch, description: previewDescription },
        { label: ProjectLanguage.Java, description: previewDescription },
        { label: ProjectLanguage.PHP, description: previewDescription },
        { label: ProjectLanguage.PowerShell, description: previewDescription },
        { label: ProjectLanguage.Python, description: previewDescription },
        { label: ProjectLanguage.TypeScript, description: previewDescription }
    ];

    const options: QuickPickOptions = { placeHolder: localize('selectLanguage', 'Select a language') };
    return <ProjectLanguage>(await ui.showQuickPick(picks, options)).label;
}

export async function promptForProjectRuntime(message?: string): Promise<ProjectRuntime> {
    const picks: IAzureQuickPickItem<ProjectRuntime | undefined>[] = [
        { label: 'Azure Functions v2', description: '(.NET Standard)', data: ProjectRuntime.v2 },
        { label: 'Azure Functions v1', description: '(.NET Framework)', data: ProjectRuntime.v1 },
        { label: localize('learnMore', 'Learn more...'), description: '', data: undefined }
    ];

    const options: IAzureQuickPickOptions = { placeHolder: message || localize('selectRuntime', 'Select a runtime'), suppressPersistence: true };
    let runtime: ProjectRuntime | undefined;
    do {
        runtime = (await ext.ui.showQuickPick(picks, options)).data;
        if (runtime === undefined) {
            // don't wait to re-show dialog
            // tslint:disable-next-line:no-floating-promises
            opn('https://aka.ms/AA1tpij');
        }
    }
    while (runtime === undefined);
    return runtime;
}

export async function selectTemplateFilter(projectPath: string, ui: IAzureUserInput): Promise<TemplateFilter> {
    const picks: QuickPickItem[] = [
        { label: TemplateFilter.Verified, description: localize('verifiedDescription', '(Subset of "Core" that has been verified in VS Code)') },
        { label: TemplateFilter.Core, description: '' },
        { label: TemplateFilter.All, description: '' }
    ];

    const options: QuickPickOptions = { placeHolder: localize('selectFilter', 'Select a template filter') };
    const result: string = (await ui.showQuickPick(picks, options)).label;
    await updateWorkspaceSetting(templateFilterSetting, result, projectPath);
    return <TemplateFilter>result;
}

export function getGlobalFuncExtensionSetting<T>(key: string, prefix: string = extensionPrefix): T | undefined {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix);
    const result: { globalValue?: T } | undefined = projectConfiguration.inspect<T>(key);
    return result && result.globalValue;
}

export function getFuncExtensionSetting<T>(key: string, fsPath?: string): T | undefined {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(extensionPrefix, fsPath ? Uri.file(fsPath) : undefined);
    return projectConfiguration.get<T>(key);
}

export async function getProjectLanguage(projectPath: string, ui: IAzureUserInput): Promise<ProjectLanguage> {
    if (await fse.pathExists(path.join(projectPath, 'pom.xml'))) {
        return ProjectLanguage.Java;
    } else {
        let language: string | undefined = getFuncExtensionSetting(projectLanguageSetting, projectPath);
        if (!language) {
            const message: string = localize('noLanguage', 'You must have a project language set to perform this operation.');
            const selectLanguage: MessageItem = { title: localize('selectLanguageButton', 'Select Language') };
            await ui.showWarningMessage(message, { modal: true }, selectLanguage, DialogResponses.cancel);
            language = await promptForProjectLanguage(ui);
            await updateWorkspaceSetting(projectLanguageSetting, language, projectPath);
        }

        return <ProjectLanguage>language;
    }
}

export async function getProjectRuntime(language: ProjectLanguage, projectPath: string, ui: IAzureUserInput): Promise<ProjectRuntime> {
    if (language === ProjectLanguage.Java) {
        // Java only supports v2
        return ProjectRuntime.v2;
    }

    let runtime: string | undefined = convertStringToRuntime(getFuncExtensionSetting(projectRuntimeSetting, projectPath));
    if (!runtime) {
        const message: string = localize('noRuntime', 'You must have a project runtime set to perform this operation.');
        const selectRuntime: MessageItem = { title: localize('selectRuntimeButton', 'Select Runtime') };
        await ui.showWarningMessage(message, { modal: true }, selectRuntime, DialogResponses.cancel);
        runtime = await promptForProjectRuntime();
        await updateWorkspaceSetting(projectRuntimeSetting, runtime, projectPath);
    }

    return <ProjectRuntime>runtime;
}

export async function getTemplateFilter(projectPath: string): Promise<TemplateFilter> {
    const templateFilter: string | undefined = getFuncExtensionSetting(templateFilterSetting, projectPath);
    return templateFilter ? <TemplateFilter>templateFilter : TemplateFilter.Verified;
}

/**
 * Special notes due to recent GA of v2 (~Sept 2018):
 * We have to support 'beta' as 'v2' since it's so commonly used. We should remove this support eventually since 'beta' will probably change meaning if there's ever a v3.
 * We no longer support 'latest'. That value is not recommended, not commonly used, and is changing meaning from v1 to v2. Better to just act like we don't recognize it.
 * https://github.com/Microsoft/vscode-azurefunctions/issues/562
 */
export function convertStringToRuntime(rawRuntime: string | undefined): ProjectRuntime | undefined {
    rawRuntime = rawRuntime ? rawRuntime.toLowerCase() : '';
    if (/^~?1.*/.test(rawRuntime)) {
        return ProjectRuntime.v1;
    } else if (/^~?2.*/.test(rawRuntime) || rawRuntime === 'beta') {
        return ProjectRuntime.v2;
    } else {
        // Return undefined if we don't recognize the runtime
        return undefined;
    }
}
