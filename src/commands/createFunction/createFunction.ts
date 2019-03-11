/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { isString } from 'util';
import { InputBoxOptions, MessageItem, QuickPickItem, Uri, window, workspace } from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext, IAzureQuickPickItem, TelemetryProperties } from 'vscode-azureextensionui';
import { localSettingsFileName, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter } from '../../constants';
import { SkipForNowError } from '../../errors';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { promptForAppSetting, validateAzureWebJobsStorage } from '../../LocalAppSettings';
import { localize } from '../../localize';
import { getProjectLanguage, getProjectRuntime, getTemplateFilter, promptForProjectLanguage, promptForProjectRuntime, selectTemplateFilter, updateWorkspaceSetting } from '../../ProjectSettings';
import { IEnumValue, IFunctionSetting, ValueType } from '../../templates/IFunctionSetting';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { IScriptFunctionTemplate } from '../../templates/parseScriptTemplates';
import { TemplateProvider } from '../../templates/TemplateProvider';
import * as workspaceUtil from '../../utils/workspace';
import { createNewProject } from '../createNewProject/createNewProject';
import { tryGetFunctionProjectRoot } from '../createNewProject/isFunctionProject';
import { CSharpFunctionCreator } from './CSharpFunctionCreator';
import { FunctionCreatorBase } from './FunctionCreatorBase';
import { JavaFunctionCreator } from './JavaFunctionCreator';
import { ScriptFunctionCreator } from './ScriptFunctionCreator';
import { TypeScriptFunctionCreator } from './TypeScriptFunctionCreator';

async function promptForSetting(actionContext: IActionContext, localSettingsPath: string, setting: IFunctionSetting): Promise<string> {
    if (setting.resourceType !== undefined) {
        return await promptForAppSetting(actionContext, localSettingsPath, setting.resourceType);
    } else {
        switch (setting.valueType) {
            case ValueType.boolean:
                return await promptForBooleanSetting(setting);
            case ValueType.enum:
                return await promptForEnumSetting(setting);
            default:
                // Default to 'string' type for any setting that isn't supported
                return await promptForStringSetting(setting);
        }
    }
}

async function promptForEnumSetting(setting: IFunctionSetting): Promise<string> {
    const picks: IAzureQuickPickItem<string>[] = setting.enums.map((ev: IEnumValue) => { return { data: ev.value, label: ev.displayName, description: '' }; });

    return (await ext.ui.showQuickPick(picks, { placeHolder: setting.label })).data;
}

async function promptForBooleanSetting(setting: IFunctionSetting): Promise<string> {
    const picks: QuickPickItem[] = [
        { label: 'true', description: '' },
        { label: 'false', description: '' }
    ];

    return (await ext.ui.showQuickPick(picks, { placeHolder: setting.label })).label;
}

async function promptForStringSetting(setting: IFunctionSetting): Promise<string> {
    const options: InputBoxOptions = {
        placeHolder: setting.label,
        prompt: setting.description || localize('azFunc.stringSettingPrompt', 'Provide a \'{0}\'', setting.label),
        validateInput: (s: string): string | undefined => setting.validateSetting(s),
        value: setting.defaultValue
    };
    return await ext.ui.showInputBox(options);
}

// tslint:disable-next-line:max-func-body-length cyclomatic-complexity
export async function createFunction(
    actionContext: IActionContext,
    folderPath?: string,
    templateId?: string,
    functionName?: string,
    caseSensitiveFunctionSettings?: { [key: string]: string | undefined },
    language?: ProjectLanguage,
    runtime?: ProjectRuntime): Promise<void> {
    addLocalFuncTelemetry(actionContext);

    const functionSettings: { [key: string]: string | undefined } = {};
    if (caseSensitiveFunctionSettings) {
        Object.keys(caseSensitiveFunctionSettings).forEach((key: string) => functionSettings[key.toLowerCase()] = caseSensitiveFunctionSettings[key]);
    }

    if (folderPath === undefined) {
        const folderPlaceholder: string = localize('azFunc.selectFunctionAppFolderExisting', 'Select the folder containing your function project');
        folderPath = await workspaceUtil.selectWorkspaceFolder(ext.ui, folderPlaceholder);
    }

    let isNewProject: boolean = false;
    let templateFilter: TemplateFilter;
    let functionAppPath: string | undefined = await tryGetFunctionProjectRoot(folderPath);
    if (!functionAppPath) {
        const message: string = localize('azFunc.notFunctionApp', 'The selected folder is not a function app project. Initialize Project?');
        const result: MessageItem = await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.skipForNow, DialogResponses.cancel);
        if (result === DialogResponses.yes) {
            await createNewProject(actionContext, folderPath, undefined, undefined, false);
            isNewProject = true;
            // Get the settings used to create the project
            language = <ProjectLanguage>actionContext.properties.projectLanguage;
            runtime = <ProjectRuntime>actionContext.properties.projectRuntime;
            templateFilter = <TemplateFilter>actionContext.properties.templateFilter;
        }

        functionAppPath = folderPath;
    }

    const localSettingsPath: string = path.join(functionAppPath, localSettingsFileName);

    if (language === undefined) {
        language = await getProjectLanguage(functionAppPath, ext.ui);
    }

    if (runtime === undefined) {
        runtime = await getProjectRuntime(language, functionAppPath, ext.ui);
    }

    let template: IFunctionTemplate;
    if (!templateId) {
        templateFilter = await getTemplateFilter(functionAppPath);
        [template, language, runtime, templateFilter] = await promptForTemplate(functionAppPath, language, runtime, templateFilter, actionContext.properties);
    } else {
        templateFilter = TemplateFilter.All;
        const templateProvider: TemplateProvider = await ext.templateProviderTask;
        const templates: IFunctionTemplate[] = await templateProvider.getTemplates(language, runtime, functionAppPath, TemplateFilter.All, actionContext.properties);
        const foundTemplate: IFunctionTemplate | undefined = templates.find((t: IFunctionTemplate) => t.id === templateId);
        if (foundTemplate) {
            template = foundTemplate;
        } else {
            throw new Error(localize('templateNotFound', 'Could not find template with language "{0}", runtime "{1}", and id "{2}".', language, runtime, templateId));
        }
    }

    actionContext.properties.projectLanguage = language;
    actionContext.properties.projectRuntime = runtime;
    actionContext.properties.templateFilter = templateFilter;

    actionContext.properties.templateId = template.id;

    let functionCreator: FunctionCreatorBase;
    switch (language) {
        case ProjectLanguage.Java:
            functionCreator = new JavaFunctionCreator(functionAppPath, template, actionContext);
            break;
        case ProjectLanguage.CSharp:
            functionCreator = new CSharpFunctionCreator(functionAppPath, template, actionContext);
            break;
        case ProjectLanguage.TypeScript:
            functionCreator = new TypeScriptFunctionCreator(functionAppPath, <IScriptFunctionTemplate>template, actionContext, language);
            break;
        default:
            functionCreator = new ScriptFunctionCreator(functionAppPath, <IScriptFunctionTemplate>template, actionContext, language);
            break;
    }

    await functionCreator.promptForSettings(ext.ui, functionName, functionSettings);

    const userSettings: { [propertyName: string]: string } = {};
    for (const setting of template.userPromptedSettings) {
        try {
            let settingValue: string | undefined;
            if (functionSettings[setting.name.toLowerCase()] !== undefined) {
                settingValue = functionSettings[setting.name.toLowerCase()];
            } else {
                settingValue = await promptForSetting(actionContext, localSettingsPath, setting);
            }

            userSettings[setting.name] = settingValue ? settingValue : '';
        } catch (error) {
            if (!(error instanceof SkipForNowError)) { // ignore error if user wants to skip this app setting
                throw error;
            }
        }
    }

    const newFilePath: string | undefined = await functionCreator.createFunction(userSettings, runtime);
    if (newFilePath && (await fse.pathExists(newFilePath))) {
        const newFileUri: Uri = Uri.file(newFilePath);
        window.showTextDocument(await workspace.openTextDocument(newFileUri));
    }

    if (!template.isHttpTrigger) {
        await validateAzureWebJobsStorage(actionContext, localSettingsPath);
    }

    // ensureFolderIsOpen sometimes restarts the extension host. Adding a second event here to see if we're losing any telemetry
    await callWithTelemetryAndErrorHandling('azureFunctions.createFunctionStarted', function (this: IActionContext): void {
        Object.assign(this, actionContext);
    });

    if (isNewProject) {
        await workspaceUtil.ensureFolderIsOpen(functionAppPath, actionContext);
    }
}

async function promptForTemplate(functionAppPath: string, language: ProjectLanguage, runtime: ProjectRuntime, templateFilter: TemplateFilter, telemetryProperties: TelemetryProperties): Promise<[IFunctionTemplate, ProjectLanguage, ProjectRuntime, TemplateFilter]> {
    const runtimePickId: string = 'runtime';
    const languagePickId: string = 'language';
    const filterPickId: string = 'filter';

    let template: IFunctionTemplate | undefined;
    while (!template) {
        const templateProvider: TemplateProvider = await ext.templateProviderTask;
        const templates: IFunctionTemplate[] = await templateProvider.getTemplates(language, runtime, functionAppPath, templateFilter, telemetryProperties);
        let picks: IAzureQuickPickItem<IFunctionTemplate | string>[] = templates.map((t: IFunctionTemplate) => { return { data: t, label: t.name, description: '' }; });
        picks = picks.concat([
            { label: localize('selectRuntime', '$(gear) Change project runtime'), description: localize('currentRuntime', 'Current: {0}', runtime), data: runtimePickId, suppressPersistence: true },
            { label: localize('selectLanguage', '$(gear) Change project language'), description: localize('currentLanguage', 'Current: {0}', language), data: languagePickId, suppressPersistence: true },
            { label: localize('selectFilter', '$(gear) Change template filter'), description: localize('currentFilter', 'Current: {0}', templateFilter), data: filterPickId, suppressPersistence: true }
        ]);

        const placeHolder: string = templates.length > 0 ? localize('azFunc.selectFuncTemplate', 'Select a function template') : localize('azFunc.noTemplatesFound', 'No templates found. Change your settings to view more templates');
        const result: IFunctionTemplate | string = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
        if (isString(result)) {
            switch (result) {
                case runtimePickId:
                    runtime = await promptForProjectRuntime();
                    await updateWorkspaceSetting(projectRuntimeSetting, runtime, functionAppPath);
                    break;
                case languagePickId:
                    language = await promptForProjectLanguage(ext.ui);
                    await updateWorkspaceSetting(projectLanguageSetting, language, functionAppPath);
                    break;
                default:
                    templateFilter = await selectTemplateFilter(functionAppPath, ext.ui);
                    break;
            }
        } else {
            template = result;
        }
    }

    return [template, language, runtime, templateFilter];
}
