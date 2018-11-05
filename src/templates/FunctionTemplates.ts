/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext, parseError, TelemetryProperties } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime, TemplateFilter, templateVersionSetting } from '../constants';
import { ext, TemplateSource } from '../extensionVariables';
import { localize } from '../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../ProjectSettings';
import { cliFeedJsonResponse, getFeedRuntime, tryGetCliFeedJson } from '../utils/getCliFeedJson';
import { DotnetTemplateRetriever, getDotnetVerifiedTemplateIds } from './DotnetTemplateRetriever';
import { IFunctionSetting } from './IFunctionSetting';
import { IFunctionTemplate, TemplateCategory } from './IFunctionTemplate';
import { parseJavaTemplates } from './parseJavaTemplates';
import { getScriptVerifiedTemplateIds, ScriptTemplateRetriever } from './ScriptTemplateRetriever';
import { TemplateRetriever } from './TemplateRetriever';

export class FunctionTemplates {
    private readonly _templatesMap: { [runtime: string]: IFunctionTemplate[] | undefined } = {};
    // if there are no templates, then there is likely no internet or a problem with the clifeed url
    private readonly _noInternetErrMsg: string = localize('retryInternet', 'There was an error in retrieving the templates.  Recheck your internet connection and try again.');
    constructor(templatesMap: { [runtime: string]: IFunctionTemplate[] | undefined }) {
        this._templatesMap = templatesMap;
        this.copyCSharpSettingsFromJS();
    }

    public async getTemplates(language: string, runtime: string, functionAppPath: string, templateFilter?: string, telemetryProperties?: TelemetryProperties): Promise<IFunctionTemplate[]> {
        const templates: IFunctionTemplate[] | undefined = this._templatesMap[runtime];
        if (!templates) {
            throw new Error(this._noInternetErrMsg);
        }

        if (language === ProjectLanguage.Java) {
            return await parseJavaTemplates(templates, functionAppPath, telemetryProperties);
        } else {
            let filterTemplates: IFunctionTemplate[] = templates.filter((t: IFunctionTemplate) => t.language.toLowerCase() === language.toLowerCase());
            switch (templateFilter) {
                case TemplateFilter.All:
                    break;
                case TemplateFilter.Core:
                    filterTemplates = filterTemplates.filter((t: IFunctionTemplate) => t.categories.find((c: TemplateCategory) => c === TemplateCategory.Core) !== undefined);
                    break;
                case TemplateFilter.Verified:
                default:
                    const verifiedTemplateIds: string[] = getScriptVerifiedTemplateIds(runtime).concat(getDotnetVerifiedTemplateIds(runtime));
                    filterTemplates = filterTemplates.filter((t: IFunctionTemplate) => verifiedTemplateIds.find((vt: string) => vt === t.id));
            }

            return filterTemplates;
        }
    }

    /**
     * The dotnet templates do not provide the validation and resourceType information that we desire
     * As a workaround, we can check for the exact same JavaScript template/setting and leverage that information
     */
    private copyCSharpSettingsFromJS(): void {
        for (const key of Object.keys(this._templatesMap)) {
            const templates: IFunctionTemplate[] | undefined = this._templatesMap[key];
            if (templates) {
                const jsTemplates: IFunctionTemplate[] = templates.filter((t: IFunctionTemplate) => t.language.toLowerCase() === ProjectLanguage.JavaScript.toLowerCase());
                const csharpTemplates: IFunctionTemplate[] = templates.filter((t: IFunctionTemplate) => t.language.toLowerCase() === ProjectLanguage.CSharp.toLowerCase());
                for (const csharpTemplate of csharpTemplates) {
                    const jsTemplate: IFunctionTemplate | undefined = jsTemplates.find((t: IFunctionTemplate) => normalizeId(t.id) === normalizeId(csharpTemplate.id));
                    if (jsTemplate) {
                        for (const cSharpSetting of csharpTemplate.userPromptedSettings) {
                            const jsSetting: IFunctionSetting | undefined = jsTemplate.userPromptedSettings.find((t: IFunctionSetting) => normalizeName(t.name) === normalizeName(cSharpSetting.name));
                            if (jsSetting) {
                                cSharpSetting.resourceType = jsSetting.resourceType;
                                cSharpSetting.validateSetting = jsSetting.validateSetting;
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Converts ids like "Azure.Function.CSharp.QueueTrigger.2.x" or "QueueTrigger-JavaScript" to "queuetrigger"
 */
function normalizeId(id: string): string {
    const match: RegExpMatchArray | null = id.match(/[a-z]+Trigger/i);
    return normalizeName(match ? match[0] : id);
}

function normalizeName(name: string): string {
    return name.toLowerCase().replace(/\s/g, '');
}

export async function getFunctionTemplates(): Promise<FunctionTemplates> {
    const templatesMap: { [runtime: string]: IFunctionTemplate[] | undefined } = {};
    const cliFeedJson: cliFeedJsonResponse | undefined = await tryGetCliFeedJson();

    const templateRetrievers: TemplateRetriever[] = [new ScriptTemplateRetriever(), new DotnetTemplateRetriever()];
    for (const templateRetriever of templateRetrievers) {
        for (const key of Object.keys(ProjectRuntime)) {
            const runtime: ProjectRuntime = <ProjectRuntime>ProjectRuntime[key];

            await callWithTelemetryAndErrorHandling('azureFunctions.getFunctionTemplates', async function (this: IActionContext): Promise<void> {
                this.suppressErrorDisplay = true;
                this.properties.isActivationEvent = 'true';
                this.properties.runtime = runtime;
                this.properties.templateType = templateRetriever.templateType;
                const templateVersion: string | undefined = await tryGetTemplateVersionSetting(this, cliFeedJson, runtime);
                let templates: IFunctionTemplate[] | undefined;

                // 1. Use the cached templates if they match templateVersion
                // tslint:disable-next-line:strict-boolean-expressions
                if (!ext.templateSource && ext.context.globalState.get(templateRetriever.getCacheKey(TemplateRetriever.templateVersionKey, runtime)) === templateVersion) {
                    templates = await templateRetriever.tryGetTemplatesFromCache(this, runtime);
                    this.properties.templateSource = 'matchingCache';
                }

                // 2. Download templates from the cli-feed if the cache doesn't match templateVersion
                // tslint:disable-next-line:strict-boolean-expressions
                if ((!ext.templateSource || ext.templateSource === TemplateSource.CliFeed || ext.templateSource === TemplateSource.StagingCliFeed) && !templates && cliFeedJson && templateVersion) {
                    templates = await templateRetriever.tryGetTemplatesFromCliFeed(this, cliFeedJson, templateVersion, runtime);
                    this.properties.templateSource = 'cliFeed';
                }

                // 3. Use the cached templates, even if they don't match templateVersion
                // tslint:disable-next-line:strict-boolean-expressions
                if (!ext.templateSource && !templates) {
                    templates = await templateRetriever.tryGetTemplatesFromCache(this, runtime);
                    this.properties.templateSource = 'mismatchCache';
                }

                // 4. Use backup templates shipped with the extension
                // tslint:disable-next-line:strict-boolean-expressions
                if ((!ext.templateSource || ext.templateSource === TemplateSource.Backup) && !templates) {
                    templates = await templateRetriever.tryGetTemplatesFromBackup(this, runtime);
                    this.properties.templateSource = 'backupFromExtension';
                }

                if (templates) {
                    // tslint:disable-next-line:strict-boolean-expressions
                    templatesMap[runtime] = (templatesMap[runtime] || []).concat(templates);
                } else {
                    // Failed to get templates for this runtime
                    this.properties.templateSource = 'None';
                }
            });
        }
    }

    return new FunctionTemplates(templatesMap);
}

export function removeLanguageFromId(id: string): string {
    return id.split('-')[0];
}

async function tryGetTemplateVersionSetting(context: IActionContext, cliFeedJson: cliFeedJsonResponse | undefined, runtime: ProjectRuntime): Promise<string | undefined> {
    const feedRuntime: string = getFeedRuntime(runtime);
    const userTemplateVersion: string | undefined = getFuncExtensionSetting(templateVersionSetting);
    try {
        if (userTemplateVersion) {
            context.properties.userTemplateVersion = userTemplateVersion;
        }
        let templateVersion: string;
        if (cliFeedJson) {
            templateVersion = userTemplateVersion ? userTemplateVersion : cliFeedJson.tags[feedRuntime].release;
            // tslint:disable-next-line:strict-boolean-expressions
            if (!cliFeedJson.releases[templateVersion]) {
                const invalidVersion: string = localize('invalidTemplateVersion', 'Failed to retrieve Azure Functions templates for version "{0}".', templateVersion);
                const selectVersion: vscode.MessageItem = { title: localize('selectVersion', 'Select version') };
                const useLatest: vscode.MessageItem = { title: localize('useLatest', 'Use latest') };
                const warningInput: vscode.MessageItem = await ext.ui.showWarningMessage(invalidVersion, selectVersion, useLatest);
                if (warningInput === selectVersion) {
                    const releaseQuickPicks: vscode.QuickPickItem[] = [];
                    for (const rel of Object.keys(cliFeedJson.releases)) {
                        releaseQuickPicks.push({
                            label: rel,
                            description: ''
                        });
                    }
                    const input: vscode.QuickPickItem | undefined = await ext.ui.showQuickPick(releaseQuickPicks, { placeHolder: invalidVersion });
                    templateVersion = input.label;
                    await updateGlobalSetting(templateVersionSetting, input.label);
                } else {
                    templateVersion = cliFeedJson.tags[feedRuntime].release;
                    // reset user setting so that it always gets latest
                    await updateGlobalSetting(templateVersionSetting, '');
                }
            }
        } else {
            return undefined;
        }

        return templateVersion;
    } catch (error) {
        // if cliJson does not have the template version being searched for, it will throw an error
        context.properties.userTemplateVersion = parseError(error).message;
        return undefined;
    }
}
