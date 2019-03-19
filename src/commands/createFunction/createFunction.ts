/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { isString } from 'util';
import { MessageItem, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, callWithTelemetryAndErrorHandling, DialogResponses, IActionContext, IAzureQuickPickItem, IWizardOptions, TelemetryProperties, UserCancelledError } from 'vscode-azureextensionui';
import { localSettingsFileName, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter } from '../../constants';
import { NoWorkspaceError } from '../../errors';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { validateAzureWebJobsStorage } from '../../LocalAppSettings';
import { localize } from '../../localize';
import { getProjectLanguage, getProjectRuntime, getTemplateFilter, promptForProjectLanguage, promptForProjectRuntime, selectTemplateFilter, updateWorkspaceSetting } from '../../ProjectSettings';
import { ValueType } from '../../templates/IFunctionSetting';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { TemplateProvider } from '../../templates/TemplateProvider';
import { dotnetUtils } from '../../utils/dotnetUtils';
import * as workspaceUtil from '../../utils/workspace';
import { createNewProject } from '../createNewProject/createNewProject';
import { tryGetFunctionProjectRoot } from '../createNewProject/isFunctionProject';
import { DotnetFunctionCreateStep } from './dotnetSteps/DotnetFunctionCreateStep';
import { DotnetFunctionNameStep } from './dotnetSteps/DotnetFunctionNameStep';
import { DotnetNamespaceStep } from './dotnetSteps/DotnetNamespaceStep';
import { IDotnetFunctionWizardContext } from './dotnetSteps/IDotnetFunctionWizardContext';
import { BooleanPromptStep } from './genericSteps/BooleanPromptStep';
import { EnumPromptStep } from './genericSteps/EnumPromptStep';
import { LocalAppSettingListStep } from './genericSteps/LocalAppSettingListStep';
import { StringPromptStep } from './genericSteps/StringPromptStep';
import { IFunctionWizardContext } from './IFunctionWizardContext';
import { JavaFunctionCreateStep } from './javaSteps/JavaFunctionCreateStep';
import { JavaFunctionNameStep } from './javaSteps/JavaFunctionNameStep';
import { JavaPackageNameStep } from './javaSteps/JavaPackageNameStep';
import { ScriptFunctionCreateStep } from './scriptSteps/ScriptFunctionCreateStep';
import { ScriptFunctionNameStep } from './scriptSteps/ScriptFunctionNameStep';
import { TypeScriptFunctionCreateStep } from './scriptSteps/TypeScriptFunctionCreateStep';

// tslint:disable-next-line: max-func-body-length
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
        const folderPlaceholder: string = localize('selectFunctionAppFolderExisting', 'Select the folder containing your function project');
        let folder: WorkspaceFolder | undefined;
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            throw new NoWorkspaceError();
        } else if (workspace.workspaceFolders.length === 1) {
            folder = workspace.workspaceFolders[0];
        } else {
            folder = await window.showWorkspaceFolderPick({ placeHolder: folderPlaceholder });
            if (!folder) {
                throw new UserCancelledError();
            }
        }

        folderPath = folder.uri.fsPath;
    }

    let isNewProject: boolean = false;
    let templateFilter: TemplateFilter;
    let functionAppPath: string | undefined = await tryGetFunctionProjectRoot(folderPath);
    if (!functionAppPath) {
        const message: string = localize('notFunctionApp', 'The selected folder is not a function app project. Initialize Project?');
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

    if (language === undefined) {
        language = await getProjectLanguage(functionAppPath, ext.ui);
    }

    if (language === ProjectLanguage.CSharp || language === ProjectLanguage.FSharp) {
        await dotnetUtils.validateDotnetInstalled(actionContext);
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

    const wizardContext: IFunctionWizardContext = { functionName, functionAppPath, template, actionContext, runtime, language };
    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, getWizardOptions(wizardContext, functionSettings));
    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);

    const newFilePath: string | undefined = wizardContext.newFilePath;
    if (newFilePath && (await fse.pathExists(newFilePath))) {
        const newFileUri: Uri = Uri.file(newFilePath);
        window.showTextDocument(await workspace.openTextDocument(newFileUri));
    }

    if (!template.isHttpTrigger) {
        const localSettingsPath: string = path.join(functionAppPath, localSettingsFileName);
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

function getWizardOptions(wizardContext: IFunctionWizardContext, defaultSettings: { [key: string]: string | undefined }): IWizardOptions<IFunctionWizardContext> {
    const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];
    switch (wizardContext.language) {
        case ProjectLanguage.Java:
            promptSteps.push(new JavaPackageNameStep(), new JavaFunctionNameStep());
            executeSteps.push(new JavaFunctionCreateStep());
            break;
        case ProjectLanguage.CSharp:
            (<IDotnetFunctionWizardContext>wizardContext).namespace = defaultSettings.namespace;
            promptSteps.push(new DotnetFunctionNameStep(), new DotnetNamespaceStep());
            executeSteps.push(new DotnetFunctionCreateStep());
            break;
        case ProjectLanguage.TypeScript:
            promptSteps.push(new ScriptFunctionNameStep());
            executeSteps.push(new TypeScriptFunctionCreateStep());
            break;
        default:
            promptSteps.push(new ScriptFunctionNameStep());
            executeSteps.push(new ScriptFunctionCreateStep());
            break;
    }

    for (const setting of wizardContext.template.userPromptedSettings) {
        if (defaultSettings[setting.name.toLowerCase()] !== undefined) {
            wizardContext[setting.name] = defaultSettings[setting.name.toLowerCase()];
        } else if (setting.resourceType !== undefined) {
            promptSteps.push(new LocalAppSettingListStep(setting));
        } else {
            switch (setting.valueType) {
                case ValueType.boolean:
                    promptSteps.push(new BooleanPromptStep(setting));
                    break;
                case ValueType.enum:
                    promptSteps.push(new EnumPromptStep(setting));
                    break;
                default:
                    // Default to 'string' type for any valueType that isn't supported
                    promptSteps.push(new StringPromptStep(setting));
                    break;
            }
        }
    }

    const title: string = localize('createFunction', 'Create new {0}', wizardContext.template.name);
    return { promptSteps, executeSteps, title, showExecuteProgress: true };
}

async function promptForTemplate(functionAppPath: string, language: ProjectLanguage, runtime: ProjectRuntime, templateFilter: TemplateFilter, telemetryProperties: TelemetryProperties): Promise<[IFunctionTemplate, ProjectLanguage, ProjectRuntime, TemplateFilter]> {
    const runtimePickId: string = 'runtime';
    const languagePickId: string = 'language';
    const filterPickId: string = 'filter';

    let template: IFunctionTemplate | undefined;
    while (!template) {
        const picksTask: Promise<IAzureQuickPickItem<IFunctionTemplate | string>[]> = ext.templateProviderTask.then(async templateProvider => {
            const templates: IFunctionTemplate[] = await templateProvider.getTemplates(language, runtime, functionAppPath, templateFilter, telemetryProperties);
            const picks: IAzureQuickPickItem<IFunctionTemplate | string>[] = templates.map((t: IFunctionTemplate) => { return { data: t, label: t.name, description: '' }; });
            return picks.concat([
                { label: localize('selectRuntime', '$(gear) Change project runtime'), description: localize('currentRuntime', 'Current: {0}', runtime), data: runtimePickId, suppressPersistence: true },
                { label: localize('selectLanguage', '$(gear) Change project language'), description: localize('currentLanguage', 'Current: {0}', language), data: languagePickId, suppressPersistence: true },
                { label: localize('selectFilter', '$(gear) Change template filter'), description: localize('currentFilter', 'Current: {0}', templateFilter), data: filterPickId, suppressPersistence: true }
            ]);
        });

        const placeHolder: string = localize('selectFuncTemplate', 'Select a function template');
        const result: IFunctionTemplate | string = (await ext.ui.showQuickPick(picksTask, { placeHolder })).data;
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
