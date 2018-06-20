/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext, parseError } from 'vscode-azureextensionui';
import { betaReleaseVersion, ProjectLanguage, ProjectRuntime, TemplateFilter, templateVersionSetting, v1ReleaseVersion } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../ProjectSettings';
import { downloadFile } from '../utils/fs';
import { cliFeedJsonResponse, getFeedRuntime, tryGetCliFeedJson } from '../utils/getCliFeedJson';
import { Config } from './Config';
import { ConfigBinding } from './ConfigBinding';
import { ConfigSetting } from './ConfigSetting';
import { Resources } from './Resources';
import { Template, TemplateCategory } from './Template';

export type parsedTemplates = [Template[], Config];
const templatesKey: string = 'FunctionTemplates';
const configKey: string = 'FunctionTemplateConfig';
const resourcesKey: string = 'FunctionTemplateResources';
const templateVersionKey: string = 'templateVersion';
const tempPath: string = path.join(os.tmpdir(), 'vscode-azurefunctions-templates');

const verifiedTemplates: string[] = [
    'BlobTrigger-JavaScript',
    'GenericWebHook-JavaScript',
    'GitHubWebHook-JavaScript',
    'HttpTrigger-JavaScript',
    'HttpTriggerWithParameters-JavaScript',
    'ManualTrigger-JavaScript',
    'QueueTrigger-JavaScript',
    'TimerTrigger-JavaScript'
];

const verifiedCSharpTemplates: string[] = [
    'HttpTrigger-CSharp',
    'BlobTrigger-CSharp',
    'QueueTrigger-CSharp',
    'TimerTrigger-CSharp'
];

const verifiedJavaTemplates: string[] = [
    'HttpTrigger',
    'BlobTrigger',
    'QueueTrigger',
    'TimerTrigger'
];
/**
 * Main container for all template data retrieved from the Azure Functions Portal. See README.md for more info and example of the schema.
 * We cache the template data retrieved from the portal so that the user can create functions offline.
 */
export class TemplateData {
    private readonly _templatesMap: { [runtime: string]: Template[] | undefined } = {};
    private readonly _configMap: { [runtime: string]: Config | undefined } = {};
    // if there are no templates, then there is likely no internet or a problem with the clifeed url
    private readonly _noInternetErrMsg: string = localize('retryInternet', 'There was an error in retrieving the templates.  Recheck your internet connection and try again.');
    constructor(templatesMap: { [runtime: string]: Template[] | undefined }, configMap: { [runtime: string]: Config | undefined }) {
        this._templatesMap = templatesMap;
        this._configMap = configMap;
    }

    public async getTemplates(language: string, runtime: string = ProjectRuntime.one, templateFilter?: string): Promise<Template[]> {
        const templates: Template[] | undefined = this._templatesMap[runtime];
        if (!templates) {
            throw new Error(this._noInternetErrMsg);
        }

        if (language === ProjectLanguage.Java) {
            // Currently we leverage JS templates to get the function metadata of Java Functions.
            // Will refactor the code here when templates HTTP API is ready.
            // See issue here: https://github.com/Microsoft/vscode-azurefunctions/issues/84
            const javaTemplates: Template[] = templates.filter((t: Template) => t.language === ProjectLanguage.JavaScript);
            return javaTemplates.filter((t: Template) => verifiedJavaTemplates.find((vt: string) => vt === removeLanguageFromId(t.id)));
        } else if (language === ProjectLanguage.CSharp) {
            // https://github.com/Microsoft/vscode-azurefunctions/issues/179
            return templates.filter((t: Template) => verifiedCSharpTemplates.some((id: string) => id === t.id));
        } else {
            switch (language) {
                case ProjectLanguage.CSharpScript:
                case ProjectLanguage.FSharpScript:
                    // The functions portal only supports script languages, so it doesn't have the notion of 'C#' vs 'C#Script'
                    language = language.replace('Script', '');
                    break;
                default:
            }

            let filterTemplates: Template[] = templates.filter((t: Template) => t.language.toLowerCase() === language.toLowerCase());
            switch (templateFilter) {
                case TemplateFilter.All:
                    break;
                case TemplateFilter.Core:
                    filterTemplates = filterTemplates.filter((t: Template) => t.isCategory(TemplateCategory.Core));
                    break;
                case TemplateFilter.Verified:
                default:
                    filterTemplates = filterTemplates.filter((t: Template) => verifiedTemplates.find((vt: string) => vt === t.id));
            }

            return filterTemplates;
        }
    }

    public async getSetting(runtime: ProjectRuntime, bindingType: string, settingName: string): Promise<ConfigSetting | undefined> {
        const config: Config | undefined = this._configMap[runtime];
        if (!config) {
            throw new Error(this._noInternetErrMsg);
        }
        const binding: ConfigBinding | undefined = config.bindings.find((b: ConfigBinding) => b.bindingType === bindingType);
        if (binding) {
            return binding.settings.find((bs: ConfigSetting) => bs.name === settingName);
        } else {
            return undefined;
        }
    }
}

function verifyTemplatesByRuntime(templates: Template[], runtime: ProjectRuntime): void {
    if (runtime === ProjectRuntime.one) {
        for (const verifiedTemplateId of verifiedTemplates) {
            if (!templates.some((t: Template) => t.id === verifiedTemplateId)) {
                throw new Error(localize('failedToFindJavaScriptTemplate', 'Failed to find verified template with id "{0}".', verifiedTemplateId));
            }
        }

        for (const verifiedTemplateId of verifiedCSharpTemplates) {
            if (!templates.some((t: Template) => t.id === verifiedTemplateId)) {
                throw new Error(localize('failedToFindCSharpTemplate', 'Failed to find verified template with id "{0}".', verifiedTemplateId));
            }
        }
    } else if (runtime === ProjectRuntime.beta) {
        for (const verifiedTemplateId of verifiedCSharpTemplates) {
            if (!templates.some((t: Template) => t.id === verifiedTemplateId)) {
                throw new Error(localize('failedToFindCSharpTemplate', 'Failed to find verified template with id "{0}".', verifiedTemplateId));
            }
        }
    }
}

export async function getTemplateData(globalState?: vscode.Memento): Promise<TemplateData> {
    const templatesMap: { [runtime: string]: Template[] | undefined } = {};
    const configMap: { [runtime: string]: Config | undefined } = {};
    const cliFeedJson: cliFeedJsonResponse | undefined = await tryGetCliFeedJson();
    for (const key of Object.keys(ProjectRuntime)) {
        await callWithTelemetryAndErrorHandling('azureFunctions.getTemplateData', ext.reporter, undefined, async function (this: IActionContext): Promise<void> {
            this.suppressErrorDisplay = true;
            this.properties.isActivationEvent = 'true';
            const runtime: ProjectRuntime = <ProjectRuntime>ProjectRuntime[key];
            this.properties.runtime = runtime;
            const templateVersion: string | undefined = await tryGetTemplateVersionSetting(this, cliFeedJson, runtime);
            let parsedTemplatesByRuntime: parsedTemplates | undefined;

            // 1. Use the cached templates if they match templateVersion
            if (globalState && globalState.get(`${templateVersionKey}-${runtime}`) === templateVersion) {
                parsedTemplatesByRuntime = await tryGetParsedTemplateDataFromCache(this, runtime, globalState);
                this.properties.templateSource = 'matchingCache';
            }

            // 2. Download templates from the cli-feed if the cache doesn't match templateVersion
            if (!parsedTemplatesByRuntime && cliFeedJson && templateVersion) {
                parsedTemplatesByRuntime = await tryGetParsedTemplateDataFromCliFeed(this, cliFeedJson, templateVersion, runtime, globalState);
                this.properties.templateSource = 'cliFeed';
            }

            // 3. Use the cached templates, even if they don't match templateVersion
            if (!parsedTemplatesByRuntime && globalState) {
                parsedTemplatesByRuntime = await tryGetParsedTemplateDataFromCache(this, runtime, globalState);
                this.properties.templateSource = 'mismatchCache';
            }

            // 4. Download templates from the cli-feed using the backupVersion
            if (!parsedTemplatesByRuntime && cliFeedJson) {
                const backupVersion: string = runtime === ProjectRuntime.one ? v1ReleaseVersion : betaReleaseVersion;
                parsedTemplatesByRuntime = await tryGetParsedTemplateDataFromCliFeed(this, cliFeedJson, backupVersion, runtime, globalState);
                this.properties.templateSource = 'backupCliFeed';
            }

            if (parsedTemplatesByRuntime) {
                [templatesMap[runtime], configMap[runtime]] = parsedTemplatesByRuntime;
            } else {
                // Failed to get templates for this runtime
                this.properties.templateSource = 'None';
            }
        });
    }
    return new TemplateData(templatesMap, configMap);
}

async function tryGetParsedTemplateDataFromCache(context: IActionContext, runtime: ProjectRuntime, globalState: vscode.Memento): Promise<parsedTemplates | undefined> {
    try {
        const cachedResources: object | undefined = globalState.get<object>(getRuntimeKey(resourcesKey, runtime));
        const cachedTemplates: object[] | undefined = globalState.get<object[]>(getRuntimeKey(templatesKey, runtime));
        const cachedConfig: object | undefined = globalState.get<object>(getRuntimeKey(configKey, runtime));
        if (cachedResources && cachedTemplates && cachedConfig) {
            return parseTemplates(cachedResources, cachedTemplates, cachedConfig);
        }
    } catch (error) {
        context.properties.cacheError = parseError(error).message;
    }
    return undefined;
}

async function tryGetParsedTemplateDataFromCliFeed(context: IActionContext, cliFeedJson: cliFeedJsonResponse, templateVersion: string, runtime: ProjectRuntime, globalState?: vscode.Memento): Promise<parsedTemplates | undefined> {
    try {
        context.properties.templateVersion = templateVersion;
        await downloadAndExtractTemplates(cliFeedJson.releases[templateVersion].templateApiZip, templateVersion);
        // only Resources.json has a capital letter
        const rawResources: object = <object>await fse.readJSON(path.join(tempPath, 'resources', 'Resources.json'));
        const rawTemplates: object[] = <object[]>await fse.readJSON(path.join(tempPath, 'templates', 'templates.json'));
        const rawConfig: object = <object>await fse.readJSON(path.join(tempPath, 'bindings', 'bindings.json'));

        const parsedTemplatesByRuntime: parsedTemplates = parseTemplates(rawResources, rawTemplates, rawConfig);
        verifyTemplatesByRuntime(parsedTemplatesByRuntime[0], runtime);
        if (globalState) {
            globalState.update(`${templateVersionKey}-${runtime}`, templateVersion);
            globalState.update(getRuntimeKey(templatesKey, runtime), rawTemplates);
            globalState.update(getRuntimeKey(configKey, runtime), rawConfig);
            globalState.update(getRuntimeKey(resourcesKey, runtime), rawResources);
        }
        return parsedTemplatesByRuntime;

    } catch (error) {
        context.properties.cliFeedError = parseError(error).message;
        return undefined;
    } finally {
        if (await fse.pathExists(tempPath)) {
            await fse.remove(tempPath);
        }
    }
}

function getRuntimeKey(baseKey: string, runtime: ProjectRuntime): string {
    return runtime === ProjectRuntime.one ? baseKey : `${baseKey}.${runtime}`;
}

function parseTemplates(rawResources: object, rawTemplates: object[], rawConfig: object): parsedTemplates {
    const resources: Resources = new Resources(rawResources);
    const templates: Template[] = [];
    for (const rawTemplate of rawTemplates) {
        try {
            templates.push(new Template(rawTemplate, resources));
        } catch (error) {
            // Ignore errors so that a single poorly formed template does not affect other templates
        }
    }
    return [templates, new Config(rawConfig, resources)];
}

export function removeLanguageFromId(id: string): string {
    return id.split('-')[0];
}

async function downloadAndExtractTemplates(templateUrl: string, release: string): Promise<{}> {
    const filePath: string = path.join(tempPath, `templates-${release}.zip`);
    ext.outputChannel.appendLine(localize('downloadTemplates', 'Downloading "v{0}" templates zip file. . .', release));
    await fse.ensureDir(tempPath);
    await downloadFile(templateUrl, filePath);

    return new Promise(async (resolve: () => void, reject: (e: Error) => void): Promise<void> => {
        // tslint:disable-next-line:no-unsafe-any
        extract(filePath, { dir: tempPath }, (err: Error) => {
            // tslint:disable-next-line:strict-boolean-expressions
            if (err) {
                reject(err);
            }
            ext.outputChannel.appendLine(localize('templatesExtracted', 'Template files extracted.'));
            resolve();
        });
    });
}

export async function tryGetTemplateVersionSetting(context: IActionContext, cliFeedJson: cliFeedJsonResponse | undefined, runtime: ProjectRuntime): Promise<string | undefined> {
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
