/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { AzureAccount } from '../../azure-account.api';
import { DialogResponses } from '../../DialogResponses';
import { IUserInterface, Pick, PickWithData } from '../../IUserInterface';
import { LocalAppSettings } from '../../LocalAppSettings';
import { localize } from '../../localize';
import { getProjectLanguage, getProjectRuntime, getTemplateFilter, ProjectLanguage, ProjectRuntime, TemplateFilter } from '../../ProjectSettings';
import { ConfigSetting, ValueType } from '../../templates/ConfigSetting';
import { EnumValue } from '../../templates/EnumValue';
import { Template } from '../../templates/Template';
import { TemplateData } from '../../templates/TemplateData';
import * as workspaceUtil from '../../utils/workspace';
import { VSCodeUI } from '../../VSCodeUI';
import { createNewProject } from '../createNewProject/createNewProject';
import { AbstractFunctionCreator } from './AbstractFunctionCreator';
import { JavaFunctionCreator } from './JavaFunctionCreator';
import { ScriptFunctionCreator } from './ScriptFunctionCreator';

const requiredFunctionAppFiles: string[] = [
    'host.json',
    'local.settings.json',
    path.join('.vscode', 'launch.json') // NOTE: tasks.json is not required if the user prefers to run 'func host start' from the command line
];

async function validateIsFunctionApp(telemetryProperties: { [key: string]: string; }, outputChannel: vscode.OutputChannel, functionAppPath: string, ui: IUserInterface): Promise<void> {
    if (requiredFunctionAppFiles.find((file: string) => !fse.existsSync(path.join(functionAppPath, file))) !== undefined) {
        const message: string = localize('azFunc.notFunctionApp', 'The selected folder is not a function app project. Initialize Project?');
        const result: vscode.MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.skipForNow, DialogResponses.cancel);
        if (result === DialogResponses.yes) {
            await createNewProject(telemetryProperties, outputChannel, functionAppPath, false, ui);
        } else if (result !== DialogResponses.skipForNow) {
            throw new UserCancelledError();
        }
    }
}

async function promptForSetting(ui: IUserInterface, localAppSettings: LocalAppSettings, setting: ConfigSetting, defaultValue?: string): Promise<string> {
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

async function promptForEnumSetting(ui: IUserInterface, setting: ConfigSetting): Promise<string> {
    const picks: PickWithData<string>[] = setting.enums.map((ev: EnumValue) => new PickWithData<string>(ev.value, ev.displayName));

    return (await ui.showQuickPick(picks, setting.label, false)).data;
}

async function promptForBooleanSetting(ui: IUserInterface, setting: ConfigSetting): Promise<string> {
    const picks: Pick[] = [new Pick('true'), new Pick('false')];

    return (await ui.showQuickPick(picks, setting.label, false)).label;
}

async function promptForStringSetting(ui: IUserInterface, setting: ConfigSetting, defaultValue?: string): Promise<string> {
    const prompt: string = localize('azFunc.stringSettingPrompt', 'Provide a \'{0}\'', setting.label);
    defaultValue = defaultValue ? defaultValue : setting.defaultValue;

    return await ui.showInputBox(setting.label, prompt, false, (s: string) => setting.validateSetting(s), defaultValue);
}

export async function createFunction(
    telemetryProperties: { [key: string]: string; },
    outputChannel: vscode.OutputChannel,
    azureAccount: AzureAccount,
    templateData: TemplateData,
    ui: IUserInterface = new VSCodeUI()): Promise<void> {

    const folderPlaceholder: string = localize('azFunc.selectFunctionAppFolderExisting', 'Select the folder containing your function app');
    const functionAppPath: string = await workspaceUtil.selectWorkspaceFolder(ui, folderPlaceholder);
    await validateIsFunctionApp(telemetryProperties, outputChannel, functionAppPath, ui);

    const localAppSettings: LocalAppSettings = new LocalAppSettings(ui, azureAccount, functionAppPath);

    const language: ProjectLanguage = await getProjectLanguage(functionAppPath, ui);
    telemetryProperties.projectLanguage = language;
    const runtime: ProjectRuntime = await getProjectRuntime(language, ui);
    telemetryProperties.projectRuntime = runtime;
    const templateFilter: TemplateFilter = await getTemplateFilter();
    telemetryProperties.templateFilter = templateFilter;

    const templatePicks: PickWithData<Template>[] = (await templateData.getTemplates(language, runtime, templateFilter, ui)).map((t: Template) => new PickWithData<Template>(t, t.name));
    const templatePlaceHolder: string = localize('azFunc.selectFuncTemplate', 'Select a function template');
    const template: Template = (await ui.showQuickPick<Template>(templatePicks, templatePlaceHolder)).data;
    telemetryProperties.templateId = template.id;

    if (!template.functionConfig.isHttpTrigger) {
        await localAppSettings.validateAzureWebJobsStorage();
    }

    let functionCreator: AbstractFunctionCreator;
    switch (language) {
        case ProjectLanguage.Java:
            functionCreator = new JavaFunctionCreator(functionAppPath, template, outputChannel);
            break;
        default:
            functionCreator = new ScriptFunctionCreator(functionAppPath, template, language);
            break;
    }

    await functionCreator.promptForSettings(ui);

    const userSettings: { [propertyName: string]: string } = {};
    for (const settingName of template.userPromptedSettings) {
        const setting: ConfigSetting | undefined = await templateData.getSetting(runtime, template.functionConfig.inBindingType, settingName);
        if (setting) {
            const defaultValue: string | undefined = template.functionConfig.inBinding[settingName];
            const settingValue: string | undefined = await promptForSetting(ui, localAppSettings, setting, defaultValue);
            userSettings[settingName] = settingValue ? settingValue : '';
        }
    }

    const newFilePath: string | undefined = await functionCreator.createFunction(userSettings);
    if (newFilePath && (await fse.pathExists(newFilePath))) {
        const newFileUri: vscode.Uri = vscode.Uri.file(newFilePath);
        vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));
    }
}
