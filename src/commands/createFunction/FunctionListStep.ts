/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, UserCancelledError, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import escape from 'escape-string-regexp';
import { type FuncVersion } from '../../FuncVersion';
import { connectorGallery, JavaBuildTool, ProjectLanguage, TemplateFilter } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type FunctionTemplateBase, type IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { TemplateSchemaVersion } from '../../templates/TemplateProviderBase';
import { durableUtils } from '../../utils/durableUtils';
import { nonNullProp } from '../../utils/nonNull';
import { isNodeV4Plus, isPythonV2Plus, nodeV4Suffix } from '../../utils/programmingModelUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { FunctionsTemplateGalleryController, type TemplateGalleryLaunchOptions } from '../createNewProject/FunctionsTemplateGalleryController';
import { FunctionSubWizard } from './FunctionSubWizard';
import { type IFunctionWizardContext } from './IFunctionWizardContext';
import { JobsListStep } from './JobsListStep';
import { DurableStorageTypeListStep } from './durableSteps/DurableStorageTypePromptStep';

export class FunctionListStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    public hideStepCount: boolean = true;

    private readonly _options: IFunctionListStepOptions;
    private readonly _functionSettings: { [key: string]: string | undefined };
    private readonly _isProjectWizard: boolean;
    private readonly _showTemplateGallery: (options: TemplateGalleryLaunchOptions) => void;

    public constructor(
        options: IFunctionListStepOptions,
        showTemplateGallery: (options: TemplateGalleryLaunchOptions) => void = launchOptions => {
            FunctionsTemplateGalleryController.createOrShow(ext.context, launchOptions);
        }) {
        super();
        this._options = options;
        this._isProjectWizard = options.isProjectWizard;
        this._functionSettings = options.functionSettings || {};
        this._showTemplateGallery = showTemplateGallery;
    }

    public async configureBeforePrompt(context: IFunctionWizardContext): Promise<void> {
        if (this._options.templateId) {
            const language: ProjectLanguage = nonNullProp(context, 'language');
            const version: FuncVersion = nonNullProp(context, 'version');
            const templateProvider = ext.templateProvider.get(context);
            const templates: FunctionTemplateBase[] = await templateProvider.getFunctionTemplates(context, context.projectPath, language, context.languageModel, version, context.projectTemplateKey);
            const foundTemplate: FunctionTemplateBase | undefined = templates.find((t: FunctionTemplateBase) => {
                if (this._options.templateId) {
                    const actualId: string = t.id.toLowerCase();
                    const expectedId: string = this._options.templateId.toLowerCase();

                    if (isNodeV4Plus(context) && !actualId.includes(nodeV4Suffix)) {
                        return false;
                    }

                    // check for an exact match or only whole word matches and escape the "\b" since it's in a string, not a RegExp expression
                    return (actualId === expectedId ||
                        new RegExp(`\\b${escape(expectedId)}\\b`, 'gmi').test(actualId)) &&
                        t.templateSchemaVersion === context.templateSchemaVersion;
                } else {
                    return false;
                }
            });
            if (foundTemplate) {
                context.functionTemplate = foundTemplate;
            } else {
                throw new Error(localize('templateNotFound', 'Could not find template with language "{0}", version "{1}", and id "{2}".', context.language, context.version, this._options.templateId));
            }
        }
    }

    public async getSubWizard(context: IFunctionWizardContext): Promise<IWizardOptions<IFunctionWizardContext> | undefined> {
        const requiresDurableStorageSetup: boolean = durableUtils.requiresDurableStorageSetup(context);

        if (context.functionTemplate?.templateSchemaVersion === TemplateSchemaVersion.v2) {
            return requiresDurableStorageSetup ?
                { promptSteps: [new DurableStorageTypeListStep(), new JobsListStep(this._isProjectWizard)] } :
                { promptSteps: [new JobsListStep(this._isProjectWizard)] };
        }

        const { promptSteps = [], executeSteps = [] } = await FunctionSubWizard.createSubWizard(context, this._functionSettings, this._isProjectWizard) ?? { promptSteps: [], executeSteps: [] };
        if (requiresDurableStorageSetup) {
            promptSteps.unshift(new DurableStorageTypeListStep());
        }

        return { promptSteps, executeSteps };
    }

    public async prompt(context: IFunctionWizardContext): Promise<void> {
        const templateProvider = ext.templateProvider.get(context);
        while (!context.functionTemplate) {
            let placeHolder: string = this._isProjectWizard ?
                localize('selectFirstFuncTemplate', "Select a template for your project's first function") :
                localize('selectFuncTemplate', 'Select a template for your function');

            if (templateProvider.templateSource) {
                placeHolder += localize('templateSource', ' (Template source: "{0}")', templateProvider.templateSource);
            }

            const result: FunctionTemplateBase | TemplatePromptResult =
                (await context.ui.showQuickPick(this.getPicks(context),
                    { placeHolder, enableGrouping: true })).data;

            if (result === 'skipForNow') {
                context.telemetry.properties.templateId = 'skipForNow';
                break;
            } else if (result === 'openAPI') {
                context.generateFromOpenAPI = true;
                break;
            } else if (result === 'reloadTemplates') {
                await templateProvider.clearTemplateCache(context, context.projectPath, nonNullProp(context, 'language'), context.languageModel, nonNullProp(context, 'version'));
                context.telemetry.properties.reloaded = 'true';
            } else if (result === connectorGallery.id) {
                const language = nonNullProp(context, 'language');
                this._showTemplateGallery({
                    initialLocation: context.projectPath,
                    initialFilters: {
                        language: language === ProjectLanguage.CSharp ? 'dotnet' : language.toLowerCase(),
                        useCase: connectorGallery.useCase,
                        resource: connectorGallery.resource,
                    },
                });
                context.telemetry.properties.flow = connectorGallery.telemetryFlow;
                context.telemetry.properties.templateId = connectorGallery.id;
                // Hand off before the classic wizard executes any project creation steps.
                throw new UserCancelledError('templateGallery');
            } else {
                context.functionTemplate = result;
            }
        }
    }

    public shouldPrompt(context: IFunctionWizardContext): boolean {
        return !context.functionTemplate &&
            context['buildTool'] !== JavaBuildTool.maven &&
            context.language !== ProjectLanguage.SelfHostedMCPServer &&
            context.language !== ProjectLanguage.Go;
    }

    private async getPicks(context: IFunctionWizardContext): Promise<IAzureQuickPickItem<FunctionTemplateBase | TemplatePromptResult>[]> {
        const language: ProjectLanguage = nonNullProp(context, 'language');
        const languageModel = context.languageModel;
        const version: FuncVersion = nonNullProp(context, 'version');
        const templateProvider = ext.templateProvider.get(context);

        const templates: FunctionTemplateBase[] = await templateProvider.getFunctionTemplates(context, context.projectPath, language, context.languageModel, version, context.projectTemplateKey);
        context.telemetry.measurements.templateCount = templates.length;
        const picks: IAzureQuickPickItem<FunctionTemplateBase | TemplatePromptResult>[] = templates
            .filter((t) => !(doesTemplateRequireExistingStorageSetup(t.id, language) && !context.hasDurableStorage))
            .sort((a, b) => sortTemplates(a, b))
            .map(t => { return { label: t.name, data: t, group: t.templateFilter ?? 'All' }; });

        if (this._isProjectWizard && !context.containerizedProject && !this._options.templateId &&
            (isPythonV2Plus(language, languageModel) ||
                language === ProjectLanguage.CSharp ||
                isNodeV4Plus(context))) {
            const label = localize('connectorTrigger', 'Connector Trigger');
            const index = picks.findIndex(p => typeof p.data === 'object' &&
                sortTemplates(p.data, { id: connectorGallery.id, name: label }) > 0);
            picks.splice(index === -1 ? picks.length : index, 0, {
                label,
                data: connectorGallery.id,
                group: TemplateFilter.Verified
            });
        }

        if (templates.length === 0) {
            picks.push({
                label: localize('noTemplates', '$(warning) No templates found'),
                suppressPersistence: true,
                data: <IFunctionTemplate | TemplatePromptResult><unknown>undefined,
                onPicked: () => { /* do nothing */ }
            });
        } else if (language === ProjectLanguage.CSharp ||
            language === ProjectLanguage.Java ||
            (language === ProjectLanguage.Python && !isPythonV2Plus(language, languageModel)) ||
            (language === ProjectLanguage.TypeScript && !isNodeV4Plus(context))) {
            // NOTE: Only show this if we actually found other templates
            picks.push({
                label: localize('openAPI', 'HTTP trigger(s) from OpenAPI V2/V3 Specification (Preview)'),
                data: 'openAPI',
                suppressPersistence: true,
                group: 'All'
            });
        }

        if (this._isProjectWizard) {
            picks.push({
                label: localize('skipForNow', '$(clock) Skip for now'),
                data: 'skipForNow',
                suppressPersistence: true,
                group: ' '
            });
        }

        if (getWorkspaceSetting<boolean>('showReloadTemplates')) {
            picks.push({
                label: localize('reloadTemplates', '$(sync) Reload templates'),
                data: 'reloadTemplates',
                suppressPersistence: true,
                group: ' '
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

type TemplatePromptResult = 'skipForNow' | 'openAPI' | 'reloadTemplates' | typeof connectorGallery.id;

// Todo: https://github.com/microsoft/vscode-azurefunctions/issues/3529
// Identify and filter out Durable Function templates requiring a pre-existing storage setup
function doesTemplateRequireExistingStorageSetup(templateId: string, language?: string): boolean {
    // Todo: Remove when Powershell and Java implementation is added
    if (language === ProjectLanguage.PowerShell || language === ProjectLanguage.Java) {
        return false;
    }

    const durableFunctions = /DurableFunctions/i;
    const entity = /DurableFunctionsEntity/i;
    const orchestrator = /Orchestrat/i;
    const entityTrigger = /DurableFunctionsEntityHttpStart/i;  // filter out directly due to overlap with the base entity template pattern

    return entityTrigger.test(templateId) || (durableFunctions.test(templateId) && !orchestrator.test(templateId) && !entity.test(templateId));
}

/**
 * Sorts templates by priority, placing HttpTrigger and TimerTrigger templates first since they're the most popular,
 * and using the template name to help determine the relative order of the remaining templates.
 */
function sortTemplates(a: Pick<FunctionTemplateBase, 'id' | 'name'>, b: Pick<FunctionTemplateBase, 'id' | 'name'>): number {
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

    const priorityDiff = getPriority(a.id) - getPriority(b.id);
    if (priorityDiff !== 0) {
        return priorityDiff;
    }

    // If priorities are the same, sort alphabetically by name
    return a.name.localeCompare(b.name);
}
