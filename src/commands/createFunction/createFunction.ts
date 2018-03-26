/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { isString } from 'util';
import { QuickPickItem } from 'vscode';
import * as vscode from 'vscode';
import { AzureTreeDataProvider, DialogResponses, IAzureQuickPickItem, IAzureUserInput, TelemetryProperties } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter } from '../../constants';
import { LocalAppSettings } from '../../LocalAppSettings';
import { localize } from '../../localize';
import { getProjectLanguage, getProjectRuntime, getTemplateFilter, promptForProjectLanguage, promptForProjectRuntime, selectTemplateFilter, updateWorkspaceSetting } from '../../ProjectSettings';
import { ConfigSetting, ValueType } from '../../templates/ConfigSetting';
import { EnumValue } from '../../templates/EnumValue';
import { Template } from '../../templates/Template';
import { TemplateData } from '../../templates/TemplateData';
import * as workspaceUtil from '../../utils/workspace';
import { createNewProject } from '../createNewProject/createNewProject';
import { isFunctionProject } from '../createNewProject/validateFunctionProjects';
import { CSharpFunctionCreator } from './CSharpFunctionCreator';
import { FunctionCreatorBase } from './FunctionCreatorBase';
import { JavaFunctionCreator } from './JavaFunctionCreator';
import { ScriptFunctionCreator } from './ScriptFunctionCreator';

async function validateIsFunctionApp(telemetryProperties: TelemetryProperties, outputChannel: vscode.OutputChannel, functionAppPath: string, ui: IAzureUserInput): Promise<void> {
    if (!await isFunctionProject(functionAppPath)) {
        const message: string = localize('azFunc.notFunctionApp', 'The selected folder is not a function app project. Initialize Project?');
        const result: vscode.MessageItem = await ui.showWarningMessage(message, DialogResponses.yes, DialogResponses.skipForNow, DialogResponses.cancel);
        if (result === DialogResponses.yes) {
            await createNewProject(telemetryProperties, outputChannel, ui, functionAppPath, undefined, undefined, false);
        }
    }
}

async function promptForSetting(ui: IAzureUserInput, localAppSettings: LocalAppSettings, setting: ConfigSetting, defaultValue?: string): Promise<string> {
    if (setting.resourceType !== undefined) {
        return await localAppSettings.promptForAppSetting(setting.resourceType);
    } else {
        switch (setting.valueType) {
            case ValueType.boolean:
                return await promptForBooleanSetting(ui, setting);
            case ValueType.enum:
                return await promptForEnumSetting(ui, setting);
            default:
                // Default to 'string' type for any setting that isn't supported
                return await promptForStringSetting(ui, setting, defaultValue);
        }
    }
}

async function promptForEnumSetting(ui: IAzureUserInput, setting: ConfigSetting): Promise<string> {
    const picks: IAzureQuickPickItem<string>[] = setting.enums.map((ev: EnumValue) => { return { data: ev.value, label: ev.displayName, description: '' }; });

    return (await ui.showQuickPick(picks, { placeHolder: setting.label })).data;
}

async function promptForBooleanSetting(ui: IAzureUserInput, setting: ConfigSetting): Promise<string> {
    const picks: QuickPickItem[] = [
        { label: 'true', description: '' },
        { label: 'false', description: '' }
    ];

    return (await ui.showQuickPick(picks, { placeHolder: setting.label })).label;
}

async function promptForStringSetting(ui: IAzureUserInput, setting: ConfigSetting, defaultValue?: string): Promise<string> {
    const options: vscode.InputBoxOptions = {
        placeHolder: setting.label,
        prompt: localize('azFunc.stringSettingPrompt', 'Provide a \'{0}\'', setting.label),
        validateInput: (s: string): string | undefined => setting.validateSetting(s),
        value: defaultValue ? defaultValue : setting.defaultValue
    };
    return await ui.showInputBox(options);
}

export async function createFunction(
    telemetryProperties: TelemetryProperties,
    outputChannel: vscode.OutputChannel,
    tree: AzureTreeDataProvider,
    templateData: TemplateData,
    ui: IAzureUserInput,
    functionAppPath?: string,
    templateId?: string,
    functionName?: string,
    caseSensitiveFunctionSettings?: { [key: string]: string | undefined; }): Promise<void> {

    const functionSettings: { [key: string]: string | undefined; } = {};
    if (caseSensitiveFunctionSettings) {
        Object.keys(caseSensitiveFunctionSettings).forEach((key: string) => functionSettings[key.toLowerCase()] = caseSensitiveFunctionSettings[key]);
    }

    if (functionAppPath === undefined) {
        const folderPlaceholder: string = localize('azFunc.selectFunctionAppFolderExisting', 'Select the folder containing your function app');
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ui, folderPlaceholder);
    }

    await validateIsFunctionApp(telemetryProperties, outputChannel, functionAppPath, ui);

    const localAppSettings: LocalAppSettings = new LocalAppSettings(ui, tree, functionAppPath);

    let language: ProjectLanguage = await getProjectLanguage(functionAppPath, ui);
    let runtime: ProjectRuntime = await getProjectRuntime(language, functionAppPath, ui);
    let templateFilter: TemplateFilter = await getTemplateFilter(functionAppPath);

    let template: Template;
    if (!templateId) {
        [template, language, runtime, templateFilter] = await promptForTemplate(ui, functionAppPath, templateData, language, runtime, templateFilter);
    } else {
        const templates: Template[] = await templateData.getTemplates(language, runtime, TemplateFilter.All);
        const foundTemplate: Template | undefined = templates.find((t: Template) => t.id === templateId);
        if (foundTemplate) {
            template = foundTemplate;
        } else {
            throw new Error(localize('templateNotFound', 'Could not find template with language "{0}", runtime "{1}", and id "{2}".', language, runtime, templateId));
        }
    }

    telemetryProperties.projectLanguage = language;
    telemetryProperties.projectRuntime = runtime;
    telemetryProperties.templateFilter = templateFilter;

    telemetryProperties.templateId = template.id;

    if (!template.functionConfig.isHttpTrigger) {
        await localAppSettings.validateAzureWebJobsStorage(ui);
    }

    let functionCreator: FunctionCreatorBase;
    switch (language) {
        case ProjectLanguage.Java:
            functionCreator = new JavaFunctionCreator(functionAppPath, template, outputChannel);
            break;
        case ProjectLanguage.CSharp:
            functionCreator = new CSharpFunctionCreator(functionAppPath, template, outputChannel, ui);
            break;
        default:
            functionCreator = new ScriptFunctionCreator(functionAppPath, template, language);
            break;
    }

    await functionCreator.promptForSettings(ui, functionName, functionSettings);

    const userSettings: { [propertyName: string]: string } = {};
    for (const settingName of template.userPromptedSettings) {
        const setting: ConfigSetting | undefined = await templateData.getSetting(runtime, template.functionConfig.inBindingType, settingName);
        if (setting) {
            let settingValue: string | undefined;
            if (functionSettings[settingName.toLowerCase()] !== undefined) {
                settingValue = functionSettings[settingName.toLowerCase()];
            } else {
                const defaultValue: string | undefined = template.functionConfig.inBinding[settingName];
                settingValue = await promptForSetting(ui, localAppSettings, setting, defaultValue);
            }

            userSettings[settingName] = settingValue ? settingValue : '';
        }
    }

    const newFilePath: string | undefined = await functionCreator.createFunction(userSettings);
    if (newFilePath && (await fse.pathExists(newFilePath))) {
        const newFileUri: vscode.Uri = vscode.Uri.file(newFilePath);
        vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));
    }
}

async function promptForTemplate(ui: IAzureUserInput, functionAppPath: string, templateData: TemplateData, language: ProjectLanguage, runtime: ProjectRuntime, templateFilter: TemplateFilter): Promise<[Template, ProjectLanguage, ProjectRuntime, TemplateFilter]> {
    const runtimePickId: string = 'runtime';
    const languagePickId: string = 'language';
    const filterPickId: string = 'filter';

    let template: Template | undefined;
    while (!template) {
        const templates: Template[] = await templateData.getTemplates(language, runtime, templateFilter);
        let picks: IAzureQuickPickItem<Template | string>[] = templates.map((t: Template) => { return { data: t, label: t.name, description: '' }; });
        picks = picks.concat([
            { label: localize('selectRuntime', '$(gear) Change project runtime'), description: localize('currentRuntime', 'Current: {0}', runtime), data: runtimePickId, suppressPersistence: true },
            { label: localize('selectLanguage', '$(gear) Change project language'), description: localize('currentLanguage', 'Current: {0}', language), data: languagePickId, suppressPersistence: true },
            { label: localize('selectFilter', '$(gear) Change template filter'), description: localize('currentFilter', 'Current: {0}', templateFilter), data: filterPickId, suppressPersistence: true }
        ]);

        const placeHolder: string = templates.length > 0 ? localize('azFunc.selectFuncTemplate', 'Select a function template') : localize('azFunc.noTemplatesFound', 'No templates found. Change your settings to view more templates');
        const result: Template | string = (await ui.showQuickPick(picks, { placeHolder })).data;
        if (isString(result)) {
            switch (result) {
                case runtimePickId:
                    runtime = await promptForProjectRuntime(ui);
                    await updateWorkspaceSetting(projectRuntimeSetting, runtime, functionAppPath);
                    break;
                case languagePickId:
                    language = await promptForProjectLanguage(ui);
                    await updateWorkspaceSetting(projectLanguageSetting, language, functionAppPath);
                    break;
                default:
                    templateFilter = await selectTemplateFilter(functionAppPath, ui);
                    break;
            }
        } else {
            template = result;
        }
    }

    return [template, language, runtime, templateFilter];
}
