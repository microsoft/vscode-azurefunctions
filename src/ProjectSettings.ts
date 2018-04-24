/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { MessageItem, QuickPickItem, QuickPickOptions, WorkspaceConfiguration } from "vscode";
import * as vscode from 'vscode';
import { DialogResponses, IAzureUserInput } from 'vscode-azureextensionui';
import { extensionPrefix, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter, templateFilterSetting } from './constants';
import { localize } from "./localize";

const previewDescription: string = localize('previewDescription', '(Preview)');

export async function updateGlobalSetting<T = string>(section: string, value: T): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix);
    await projectConfiguration.update(section, value, vscode.ConfigurationTarget.Global);
}

export async function updateWorkspaceSetting<T = string>(section: string, value: T, fsPath: string): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix, vscode.Uri.file(fsPath));
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

export async function promptForProjectRuntime(ui: IAzureUserInput): Promise<ProjectRuntime> {
    const picks: QuickPickItem[] = [
        { label: ProjectRuntime.one, description: localize('productionUseDescription', '(Approved for production use)') },
        { label: ProjectRuntime.beta, description: previewDescription }
    ];

    const options: QuickPickOptions = { placeHolder: localize('selectRuntime', 'Select a runtime') };
    return <ProjectRuntime>(await ui.showQuickPick(picks, options)).label;
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

export function getGlobalFuncExtensionSetting<T>(key: string): T | undefined {
    const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix);
    const result: { globalValue?: T } | undefined = projectConfiguration.inspect<T>(key);
    return result && result.globalValue;
}

export function getFuncExtensionSetting<T>(key: string, fsPath?: string): T | undefined {
    const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix, fsPath ? vscode.Uri.file(fsPath) : undefined);
    // tslint:disable-next-line:no-backbone-get-set-outside-model
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
        // Java only supports beta
        return ProjectRuntime.beta;
    }

    let runtime: string | undefined = convertStringToRuntime(getFuncExtensionSetting(projectRuntimeSetting, projectPath));
    if (!runtime) {
        const message: string = localize('noRuntime', 'You must have a project runtime set to perform this operation.');
        const selectRuntime: MessageItem = { title: localize('selectRuntimeButton', 'Select Runtime') };
        await ui.showWarningMessage(message, { modal: true }, selectRuntime, DialogResponses.cancel);
        runtime = await promptForProjectRuntime(ui);
        await updateWorkspaceSetting(projectRuntimeSetting, runtime, projectPath);
    }

    return <ProjectRuntime>runtime;
}

export async function getTemplateFilter(projectPath: string): Promise<TemplateFilter> {
    const templateFilter: string | undefined = getFuncExtensionSetting(templateFilterSetting, projectPath);
    return templateFilter ? <TemplateFilter>templateFilter : TemplateFilter.Verified;
}

export function convertStringToRuntime(rawRuntime?: string): ProjectRuntime | undefined {
    switch (String(rawRuntime).toLowerCase()) {
        case 'beta':
            return ProjectRuntime.beta;
        case '~1':
        case 'latest':
            return ProjectRuntime.one;
        default:
            return undefined;
    }
}
