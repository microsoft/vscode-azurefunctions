/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions, IWizardOptions } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime, TemplateFilter, templateFilterSetting } from '../../constants';
import { canValidateAzureWebJobStorageOnDebug } from '../../debug/validatePreDebug';
import { ext } from '../../extensionVariables';
import { getAzureWebJobsStorage } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { nonNullProp } from '../../utils/nonNull';
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
import { ScriptFunctionCreateStep } from './scriptSteps/ScriptFunctionCreateStep';
import { ScriptFunctionNameStep } from './scriptSteps/ScriptFunctionNameStep';
import { TypeScriptFunctionCreateStep } from './scriptSteps/TypeScriptFunctionCreateStep';

export class FunctionListStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    public hideStepCount: boolean = true;

    private readonly _triggerSettings: { [key: string]: string | undefined };
    private readonly _isProjectWizard: boolean;

    private constructor(triggerSettings: { [key: string]: string | undefined } | undefined, isProjectWizard: boolean | undefined) {
        super();
        // tslint:disable-next-line: strict-boolean-expressions
        this._triggerSettings = triggerSettings || {};
        this._isProjectWizard = !!isProjectWizard;
    }

    public static async create(context: IFunctionWizardContext, options: IFunctionListStepOptions): Promise<FunctionListStep> {
        if (options.templateId) {
            const language: ProjectLanguage = nonNullProp(context, 'language');
            const runtime: ProjectRuntime = nonNullProp(context, 'runtime');
            const templates: IFunctionTemplate[] = await ext.templateProvider.getFunctionTemplates(context, context.projectPath, language, runtime, TemplateFilter.All);
            const foundTemplate: IFunctionTemplate | undefined = templates.find((t: IFunctionTemplate) => t.id === options.templateId);
            if (foundTemplate) {
                context.functionTemplate = foundTemplate;
            } else {
                throw new Error(localize('templateNotFound', 'Could not find template with language "{0}", runtime "{1}", and id "{2}".', context.language, context.runtime, options.templateId));
            }
        }

        return new FunctionListStep(options.triggerSettings, options.isProjectWizard);
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

            // Add settings to context that were programatically passed in
            for (const key of Object.keys(this._triggerSettings)) {
                context[key.toLowerCase()] = this._triggerSettings[key];
            }

            addBindingSettingSteps(template.userPromptedSettings, promptSteps);

            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];
            switch (context.language) {
                case ProjectLanguage.Java:
                    executeSteps.push(await JavaFunctionCreateStep.createStep(context));
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

            if (!template.isHttpTrigger && !canValidateAzureWebJobStorageOnDebug(context.language) && !await getAzureWebJobsStorage(context.projectPath)) {
                promptSteps.push(new AzureWebJobsStoragePromptStep());
                executeSteps.push(new AzureWebJobsStorageExecuteStep());
            }

            const title: string = localize('createFunction', 'Create new {0}', template.name);
            return { promptSteps, executeSteps, title };
        } else {
            return undefined;
        }
    }

    public async prompt(context: IFunctionWizardContext): Promise<void> {
        // tslint:disable-next-line: strict-boolean-expressions
        let templateFilter: TemplateFilter = getWorkspaceSetting<TemplateFilter>(templateFilterSetting, context.projectPath) || TemplateFilter.Verified;

        while (!context.functionTemplate) {
            const placeHolder: string = this._isProjectWizard ?
                localize('selectFirstFuncTemplate', "Select a template for your project's first function") :
                localize('selectFuncTemplate', 'Select a template for your function');
            const result: IFunctionTemplate | TemplatePromptResult = (await ext.ui.showQuickPick(this.getPicks(context, templateFilter), { placeHolder })).data;
            if (result === 'skipForNow') {
                context.telemetry.properties.templateId = 'skipForNow';
                break;
            } else if (result === 'changeFilter') {
                templateFilter = await promptForTemplateFilter();
                // can only update setting if it's open in a workspace
                if (!this._isProjectWizard || context.openBehavior === 'AlreadyOpen') {
                    await updateWorkspaceSetting(templateFilterSetting, templateFilter, context.projectPath);
                }
            } else {
                context.functionTemplate = result;
            }
        }

        context.telemetry.properties.templateFilter = templateFilter;
    }

    public shouldPrompt(context: IFunctionWizardContext): boolean {
        return !context.functionTemplate;
    }

    private async getPicks(context: IFunctionWizardContext, templateFilter: TemplateFilter): Promise<IAzureQuickPickItem<IFunctionTemplate | TemplatePromptResult>[]> {
        const language: ProjectLanguage = nonNullProp(context, 'language');
        const runtime: ProjectRuntime = nonNullProp(context, 'runtime');
        const templates: IFunctionTemplate[] = await ext.templateProvider.getFunctionTemplates(context, context.projectPath, language, runtime, templateFilter);
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

        picks.push({
            label: localize('selectFilter', '$(gear) Change template filter'),
            description: localize('currentFilter', 'Current: {0}', templateFilter),
            data: 'changeFilter',
            suppressPersistence: true
        });

        return picks;
    }
}

interface IFunctionListStepOptions {
    isProjectWizard: boolean;
    templateId: string | undefined;
    triggerSettings: { [key: string]: string | undefined } | undefined;
}

type TemplatePromptResult = 'changeFilter' | 'skipForNow';

async function promptForTemplateFilter(): Promise<TemplateFilter> {
    const picks: IAzureQuickPickItem<TemplateFilter>[] = [
        { label: TemplateFilter.Verified, description: localize('verifiedDescription', '(Subset of "Core" that has been verified in VS Code)'), data: TemplateFilter.Verified },
        { label: TemplateFilter.Core, data: TemplateFilter.Core },
        { label: TemplateFilter.All, data: TemplateFilter.All }
    ];

    const options: IAzureQuickPickOptions = { suppressPersistence: true, placeHolder: localize('selectFilter', 'Select a template filter') };
    return (await ext.ui.showQuickPick(picks, options)).data;
}

/**
 * If templateFilter is verified, puts HttpTrigger at the top since it's the most popular
 * Otherwise sort alphabetically
 */
function sortTemplates(a: IFunctionTemplate, b: IFunctionTemplate, templateFilter: TemplateFilter): number {
    if (templateFilter === TemplateFilter.Verified) {
        const regExp: RegExp = /httptrigger($|[^a-z])/i;
        if (regExp.test(a.id)) {
            return -1;
        } else if (regExp.test(b.id)) {
            return 1;
        }
    }

    return a.name.localeCompare(b.name);
}
