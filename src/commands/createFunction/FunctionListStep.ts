/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IActionContext, IAzureQuickPickItem, IAzureQuickPickOptions, IWizardOptions, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as escape from 'escape-string-regexp';
import { JavaBuildTool, ProjectLanguage, TemplateFilter, templateFilterSetting } from '../../constants';
import { canValidateAzureWebJobStorageOnDebug } from '../../debug/validatePreDebug';
import { ext } from '../../extensionVariables';
import { getAzureWebJobsStorage } from '../../funcConfig/local.settings';
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { addBindingSettingSteps } from '../addBinding/settingSteps/addBindingSettingSteps';
import { AzureWebJobsStorageExecuteStep } from '../appSettings/AzureWebJobsStorageExecuteStep';
import { AzureWebJobsStoragePromptStep } from '../appSettings/AzureWebJobsStoragePromptStep';
import { JavaPackageNameStep } from '../createNewProject/javaSteps/JavaPackageNameStep';
import { DotnetFunctionCreateStep } from './dotnetSteps/DotnetFunctionCreateStep';
import { DotnetFunctionNameStep } from './dotnetSteps/DotnetFunctionNameStep';
import { DotnetNamespaceStep } from './dotnetSteps/DotnetNamespaceStep';
import { IFunctionWizardContext } from './IFunctionWizardContext';
import { JavaFunctionCreateStep } from './javaSteps/JavaFunctionCreateStep';
import { JavaFunctionNameStep } from './javaSteps/JavaFunctionNameStep';
import { OpenAPICreateStep } from './openAPISteps/OpenAPICreateStep';
import { OpenAPIGetSpecificationFileStep } from './openAPISteps/OpenAPIGetSpecificationFileStep';
import { ScriptFunctionCreateStep } from './scriptSteps/ScriptFunctionCreateStep';
import { ScriptFunctionNameStep } from './scriptSteps/ScriptFunctionNameStep';
import { TypeScriptFunctionCreateStep } from './scriptSteps/TypeScriptFunctionCreateStep';

export class FunctionListStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    public hideStepCount: boolean = true;

    private readonly _functionSettings: { [key: string]: string | undefined };
    private readonly _isProjectWizard: boolean;

    private constructor(functionSettings: { [key: string]: string | undefined } | undefined, isProjectWizard: boolean | undefined) {
        super();
        this._functionSettings = functionSettings || {};
        this._isProjectWizard = !!isProjectWizard;
    }

    public static async create(context: IFunctionWizardContext, options: IFunctionListStepOptions): Promise<FunctionListStep> {
        if (options.templateId) {
            const language: ProjectLanguage = nonNullProp(context, 'language');
            const version: FuncVersion = nonNullProp(context, 'version');
            const templateProvider = ext.templateProvider.get(context);
            const templates: IFunctionTemplate[] = await templateProvider.getFunctionTemplates(context, context.projectPath, language, version, TemplateFilter.All, context.projectTemplateKey);
            const foundTemplate: IFunctionTemplate | undefined = templates.find((t: IFunctionTemplate) => {
                if (options.templateId) {
                    const actualId: string = t.id.toLowerCase();
                    const expectedId: string = options.templateId.toLowerCase();
                    // check for an exact match or only whole word matches and escape the "\b" since it's in a string, not a RegExp expression
                    return actualId === expectedId || new RegExp(`\\b${escape(expectedId)}\\b`, 'gmi').test(actualId);
                } else {
                    return false;
                }
            });
            if (foundTemplate) {
                context.functionTemplate = foundTemplate;
            } else {
                throw new Error(localize('templateNotFound', 'Could not find template with language "{0}", version "{1}", and id "{2}".', context.language, context.version, options.templateId));
            }
        }

        return new FunctionListStep(options.functionSettings, options.isProjectWizard);
    }

    public async getSubWizard(context: IFunctionWizardContext): Promise<IWizardOptions<IFunctionWizardContext> | undefined> {
        const template: IFunctionTemplate | undefined = context.functionTemplate;
        if (template) {
            const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];
            switch (context.language) {
                case ProjectLanguage.Java:
                    promptSteps.push(new JavaPackageNameStep(), new JavaFunctionNameStep());
                    break;
                case ProjectLanguage.CSharp:
                case ProjectLanguage.FSharp:
                    promptSteps.push(new DotnetFunctionNameStep(), new DotnetNamespaceStep());
                    break;
                default:
                    promptSteps.push(new ScriptFunctionNameStep());
                    break;
            }

            // Add settings to context that were programmatically passed in
            for (const key of Object.keys(this._functionSettings)) {
                context[key.toLowerCase()] = this._functionSettings[key];
            }

            addBindingSettingSteps(template.userPromptedSettings, promptSteps);

            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];
            switch (context.language) {
                case ProjectLanguage.Java:
                    executeSteps.push(new JavaFunctionCreateStep());
                    break;
                case ProjectLanguage.CSharp:
                case ProjectLanguage.FSharp:
                    executeSteps.push(await DotnetFunctionCreateStep.createStep(context));
                    break;
                case ProjectLanguage.TypeScript:
                    executeSteps.push(new TypeScriptFunctionCreateStep());
                    break;
                default:
                    executeSteps.push(new ScriptFunctionCreateStep());
                    break;
            }

            if ((!template.isHttpTrigger && !template.isSqlBindingTemplate) && !canValidateAzureWebJobStorageOnDebug(context.language) && !await getAzureWebJobsStorage(context, context.projectPath)) {
                promptSteps.push(new AzureWebJobsStoragePromptStep());
                executeSteps.push(new AzureWebJobsStorageExecuteStep());
            }

            const title: string = localize('createFunction', 'Create new {0}', template.name);
            return { promptSteps, executeSteps, title };
        } else if (context.generateFromOpenAPI) {
            const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];
            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];

            switch (context.language) {
                case ProjectLanguage.Java:
                    promptSteps.push(new JavaPackageNameStep());
                    break;
                case ProjectLanguage.CSharp:
                    promptSteps.push(new DotnetNamespaceStep());
                    break;
                default:
                    break;
            }

            promptSteps.push(new OpenAPIGetSpecificationFileStep());
            executeSteps.push(await OpenAPICreateStep.createStep(context));

            const title: string = localize('createFunction', 'Create new {0}', 'HTTP Triggers from OpenAPI (v2/v3) Specification File');
            return { promptSteps, executeSteps, title };
        } else {
            return undefined;
        }
    }

    public async prompt(context: IFunctionWizardContext): Promise<void> {
        let templateFilter: TemplateFilter = getWorkspaceSetting<TemplateFilter>(templateFilterSetting, context.projectPath) || TemplateFilter.Verified;

        const templateProvider = ext.templateProvider.get(context);
        while (!context.functionTemplate) {
            let placeHolder: string = this._isProjectWizard ?
                localize('selectFirstFuncTemplate', "Select a template for your project's first function") :
                localize('selectFuncTemplate', 'Select a template for your function');

            if (templateProvider.templateSource) {
                placeHolder += localize('templateSource', ' (Template source: "{0}")', templateProvider.templateSource)
            }

            const result: IFunctionTemplate | TemplatePromptResult = (await context.ui.showQuickPick(this.getPicks(context, templateFilter), { placeHolder })).data;
            if (result === 'skipForNow') {
                context.telemetry.properties.templateId = 'skipForNow';
                break;
            } else if (result === 'changeFilter') {
                templateFilter = await promptForTemplateFilter(context);
                // can only update setting if it's open in a workspace
                if (!this._isProjectWizard || context.openBehavior === 'AlreadyOpen') {
                    await updateWorkspaceSetting(templateFilterSetting, templateFilter, context.projectPath);
                }
                context.telemetry.properties.changedFilter = 'true';
            } else if (result === 'openAPI') {
                context.generateFromOpenAPI = true;
                break;
            } else if (result === 'reloadTemplates') {
                await templateProvider.clearTemplateCache(context, context.projectPath, nonNullProp(context, 'language'), nonNullProp(context, 'version'));
                context.telemetry.properties.reloaded = 'true';
            } else {
                context.functionTemplate = result;
            }
        }

        context.telemetry.properties.templateFilter = templateFilter;
    }

    public shouldPrompt(context: IFunctionWizardContext): boolean {
        return !context.functionTemplate && context['buildTool'] !== JavaBuildTool.maven;
    }

    private async getPicks(context: IFunctionWizardContext, templateFilter: TemplateFilter): Promise<IAzureQuickPickItem<IFunctionTemplate | TemplatePromptResult>[]> {
        const language: ProjectLanguage = nonNullProp(context, 'language');
        const version: FuncVersion = nonNullProp(context, 'version');
        const templateProvider = ext.templateProvider.get(context);
        const templates: IFunctionTemplate[] = await templateProvider.getFunctionTemplates(context, context.projectPath, language, version, templateFilter, context.projectTemplateKey);
        context.telemetry.measurements.templateCount = templates.length;
        const picks: IAzureQuickPickItem<IFunctionTemplate | TemplatePromptResult>[] = templates
            .sort((a, b) => sortTemplates(a, b, templateFilter))
            .map(t => { return { label: t.name, data: t }; });

        if (this._isProjectWizard) {
            picks.unshift({
                label: localize('skipForNow', '$(clock) Skip for now'),
                data: 'skipForNow',
                suppressPersistence: true
            });
        }

        if (templates.length === 0) {
            picks.push({
                label: localize('noTemplates', '$(warning) No templates found'),
                suppressPersistence: true,
                data: <IFunctionTemplate | TemplatePromptResult><unknown>undefined,
                onPicked: () => { /* do nothing */ }
            })
        } else if (language === ProjectLanguage.CSharp || language === ProjectLanguage.Java || language === ProjectLanguage.Python || language === ProjectLanguage.TypeScript) {
            // NOTE: Only show this if we actually found other templates
            picks.push({
                label: localize('openAPI', 'HTTP trigger(s) from OpenAPI V2/V3 Specification (Preview)'),
                data: 'openAPI',
                suppressPersistence: true
            });
        }

        picks.push({
            label: localize('selectFilter', '$(gear) Change template filter'),
            description: localize('currentFilter', 'Current: {0}', templateFilter),
            data: 'changeFilter',
            suppressPersistence: true
        });

        if (getWorkspaceSetting<boolean>('showReloadTemplates')) {
            picks.push({
                label: localize('reloadTemplates', '$(sync) Reload templates'),
                data: 'reloadTemplates',
                suppressPersistence: true
            });
        }

        return picks;
    }
}

interface IFunctionListStepOptions {
    isProjectWizard: boolean;
    templateId: string | undefined;
    functionSettings: { [key: string]: string | undefined } | undefined;
}

type TemplatePromptResult = 'changeFilter' | 'skipForNow' | 'openAPI' | 'reloadTemplates';

async function promptForTemplateFilter(context: IActionContext): Promise<TemplateFilter> {
    const picks: IAzureQuickPickItem<TemplateFilter>[] = [
        { label: TemplateFilter.Verified, description: localize('verifiedDescription', '(Subset of "Core" that has been verified in VS Code)'), data: TemplateFilter.Verified },
        { label: TemplateFilter.Core, data: TemplateFilter.Core },
        { label: TemplateFilter.All, data: TemplateFilter.All }
    ];

    const options: IAzureQuickPickOptions = { suppressPersistence: true, placeHolder: localize('selectFilter', 'Select a template filter') };
    return (await context.ui.showQuickPick(picks, options)).data;
}

/**
 * If templateFilter is verified, puts HttpTrigger/TimerTrigger at the top since they're the most popular
 * Otherwise sort alphabetically
 */
function sortTemplates(a: IFunctionTemplate, b: IFunctionTemplate, templateFilter: TemplateFilter): number {
    if (templateFilter === TemplateFilter.Verified) {
        function getPriority(id: string): number {
            if (/\bhttptrigger\b/i.test(id)) { // Plain http trigger
                return 1;
            } else if (/\bhttptrigger/i.test(id)) { // Http trigger with any extra pizazz
                return 2;
            } else if (/\btimertrigger\b/i.test(id)) {
                return 3;
            } else {
                return 4;
            }
        }
        return getPriority(a.id) - getPriority(b.id);
    }

    return a.name.localeCompare(b.name);
}
