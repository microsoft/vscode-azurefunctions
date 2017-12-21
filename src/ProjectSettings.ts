/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { ConfigurationTarget, MessageItem, WorkspaceConfiguration } from "vscode";
import * as vscode from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { DialogResponses } from './DialogResponses';
import { IUserInterface, Pick } from "./IUserInterface";
import { localize } from "./localize";

export const extensionPrefix: string = 'azureFunctions';
export const projectLanguageSetting: string = 'projectLanguage';
export const projectRuntimeSetting: string = 'projectRuntime';
export const templateFilterSetting: string = 'templateFilter';

const previewDescription: string = localize('previewDescription', '(Preview)');

export enum ProjectLanguage {
    Bash = 'Bash',
    Batch = 'Batch',
    FSharp = 'F#',
    Java = 'Java',
    JavaScript = 'JavaScript',
    PHP = 'PHP',
    PowerShell = 'PowerShell',
    Python = 'Python',
    TypeScript = 'TypeScript'
}

export enum ProjectRuntime {
    one = '~1',
    beta = 'beta'
}

export enum TemplateFilter {
    All = 'All',
    Core = 'Core',
    Verified = 'Verified'
}

async function updateWorkspaceSetting(section: string, value: string): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix);
    await projectConfiguration.update(section, value, ConfigurationTarget.Workspace);
}

export async function selectProjectLanguage(ui: IUserInterface): Promise<ProjectLanguage> {
    const picks: Pick[] = [
        new Pick(ProjectLanguage.JavaScript),
        new Pick(ProjectLanguage.FSharp),
        new Pick(ProjectLanguage.Bash, previewDescription),
        new Pick(ProjectLanguage.Batch, previewDescription),
        new Pick(ProjectLanguage.Java, previewDescription),
        new Pick(ProjectLanguage.PHP, previewDescription),
        new Pick(ProjectLanguage.PowerShell, previewDescription),
        new Pick(ProjectLanguage.Python, previewDescription),
        new Pick(ProjectLanguage.TypeScript, previewDescription)
    ];

    const result: string = (await ui.showQuickPick(picks, localize('selectLanguage', 'Select a language'))).label;
    await updateWorkspaceSetting(projectLanguageSetting, result);
    return <ProjectLanguage>result;
}

export async function selectProjectRuntime(ui: IUserInterface): Promise<ProjectRuntime> {
    const picks: Pick[] = [
        new Pick(ProjectRuntime.one, localize('productionUseDescription', '(Approved for production use)')),
        new Pick(ProjectRuntime.beta, previewDescription)
    ];

    const result: string = (await ui.showQuickPick(picks, localize('selectRuntime', 'Select a runtime'))).label;
    await updateWorkspaceSetting(projectRuntimeSetting, result);
    return <ProjectRuntime>result;
}

export async function selectTemplateFilter(ui: IUserInterface): Promise<TemplateFilter> {
    const picks: Pick[] = [
        new Pick(TemplateFilter.Verified, localize('verifiedDescription', '(Subset of "Core" that has been verified in VS Code)')),
        new Pick(TemplateFilter.Core),
        new Pick(TemplateFilter.All)
    ];

    const result: string = (await ui.showQuickPick(picks, localize('selectFilter', 'Select a template filter'))).label;
    await updateWorkspaceSetting(templateFilterSetting, result);
    return <TemplateFilter>result;
}

export async function getProjectLanguage(projectPath: string, ui: IUserInterface): Promise<ProjectLanguage> {
    if (await fse.pathExists(path.join(projectPath, 'pom.xml'))) {
        return ProjectLanguage.Java;
    } else {
        const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix);
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        let language: string | undefined = projectConfiguration.get(projectLanguageSetting);

        if (!language) {
            const message: string = localize('noLanguage', 'You must have a project language set to perform this operation.');
            const selectLanguage: MessageItem = { title: localize('selectLanguageButton', 'Select Language') };
            const result: MessageItem | undefined = await vscode.window.showWarningMessage(message, selectLanguage, DialogResponses.cancel);
            if (result !== selectLanguage) {
                throw new UserCancelledError();
            } else {
                language = await selectProjectLanguage(ui);
            }
        }

        return <ProjectLanguage>language;
    }
}

export async function getProjectRuntime(language: ProjectLanguage, ui: IUserInterface): Promise<ProjectRuntime> {
    if (language === ProjectLanguage.Java) {
        // Java only supports beta
        return ProjectRuntime.beta;
    }

    const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix);
    // tslint:disable-next-line:no-backbone-get-set-outside-model
    let runtime: string | undefined = convertStringToRuntime(projectConfiguration.get(projectRuntimeSetting));
    if (!runtime) {
        const message: string = localize('noRuntime', 'You must have a project runtime set to perform this operation.');
        const selectRuntime: MessageItem = { title: localize('selectRuntimeButton', 'Select Runtime') };
        const result: MessageItem | undefined = await vscode.window.showWarningMessage(message, selectRuntime, DialogResponses.cancel);
        if (result !== selectRuntime) {
            throw new UserCancelledError();
        } else {
            runtime = await selectProjectRuntime(ui);
        }
    }

    return <ProjectRuntime>runtime;
}

export async function getTemplateFilter(): Promise<TemplateFilter> {
    const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix);
    // tslint:disable-next-line:no-backbone-get-set-outside-model
    const templateFilter: string | undefined = projectConfiguration.get(templateFilterSetting);
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
