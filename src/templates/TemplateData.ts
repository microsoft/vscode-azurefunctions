/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
import { gt } from 'semver';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ScriptProjectCreatorBase } from '../commands/createNewProject/ScriptProjectCreatorBase';
import { backupTemplateVersionSetting, ProjectLanguage, ProjectRuntime, TemplateFilter } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getFuncExtensionSetting } from '../ProjectSettings';
import { cliFeedJsonResponse } from '../utils/getCliFeedJson';
import { Config } from './Config';
import { ConfigBinding } from './ConfigBinding';
import { ConfigSetting } from './ConfigSetting';
import { Resources } from './Resources';
import { Template, TemplateCategory } from './Template';

const templatesKey: string = 'FunctionTemplates';
const configKey: string = 'FunctionTemplateConfig';
const resourcesKey: string = 'FunctionTemplateResources';
const tempPath: string = path.join(os.tmpdir(), 'vscode-azurefunctions-templates');

/**
 * Main container for all template data retrieved from the Azure Functions Portal. See README.md for more info and example of the schema.
 * We cache the template data retrieved from the portal so that the user can create functions offline.
 */
export class TemplateData {
    private readonly _templatesMap: { [runtime: string]: Template[] } = {};
    private readonly _configMap: { [runtime: string]: Config } = {};

    private readonly _verifiedTemplates: string[] = [
        'BlobTrigger-JavaScript',
        'GenericWebHook-JavaScript',
        'GitHubWebHook-JavaScript',
        'HttpTrigger-JavaScript',
        'HttpTriggerWithParameters-JavaScript',
        'ManualTrigger-JavaScript',
        'QueueTrigger-JavaScript',
        'TimerTrigger-JavaScript'
    ];

    private readonly _cSharpTemplates: string[] = [
        'HttpTrigger-CSharp',
        'BlobTrigger-CSharp',
        'QueueTrigger-CSharp',
        'TimerTrigger-CSharp'
    ];

    private readonly _javaTemplates: string[] = [
        'HttpTrigger',
        'BlobTrigger',
        'QueueTrigger',
        'TimerTrigger'
    ];

    constructor(templatesMap: { [runtime: string]: Template[] }, configMap: { [runtime: string]: Config }) {
        for (const verifiedTemplateId of this._verifiedTemplates) {
            if (!templatesMap[ScriptProjectCreatorBase.defaultRuntime].some((t: Template) => t.id === verifiedTemplateId)) {
                throw new Error(localize('failedToFindJavaScriptTemplate', 'Failed to find verified template with id "{0}".', verifiedTemplateId));
            }
        }

        for (const verifiedTemplateId of this._cSharpTemplates) {
            if (!templatesMap[ProjectRuntime.one].some((t: Template) => t.id === verifiedTemplateId) || !templatesMap[ProjectRuntime.beta].some((t: Template) => t.id === verifiedTemplateId)) {
                throw new Error(localize('failedToFindCSharpTemplate', 'Failed to find verified template with id "{0}".', verifiedTemplateId));
            }
        }

        this._templatesMap = templatesMap;
        this._configMap = configMap;
    }

    public async getTemplates(language: string, runtime: string = ProjectRuntime.one, templateFilter?: string): Promise<Template[]> {
        if (language === ProjectLanguage.Java) {
            // Currently we leverage JS templates to get the function metadata of Java Functions.
            // Will refactor the code here when templates HTTP API is ready.
            // See issue here: https://github.com/Microsoft/vscode-azurefunctions/issues/84
            const javaTemplates: Template[] = this._templatesMap[runtime].filter((t: Template) => t.language === ProjectLanguage.JavaScript);
            return javaTemplates.filter((t: Template) => this._javaTemplates.find((vt: string) => vt === removeLanguageFromId(t.id)));
        } else if (language === ProjectLanguage.CSharp) {
            // https://github.com/Microsoft/vscode-azurefunctions/issues/179
            return this._templatesMap[runtime].filter((t: Template) => this._cSharpTemplates.some((id: string) => id === t.id));
        } else {
            switch (language) {
                case ProjectLanguage.CSharpScript:
                case ProjectLanguage.FSharpScript:
                    // The functions portal only supports script languages, so it doesn't have the notion of 'C#' vs 'C#Script'
                    language = language.replace('Script', '');
                    break;
                default:
            }

            let templates: Template[] = this._templatesMap[runtime].filter((t: Template) => t.language.toLowerCase() === language.toLowerCase());
            switch (templateFilter) {
                case TemplateFilter.All:
                    break;
                case TemplateFilter.Core:
                    templates = templates.filter((t: Template) => t.isCategory(TemplateCategory.Core));
                    break;
                case TemplateFilter.Verified:
                default:
                    templates = templates.filter((t: Template) => this._verifiedTemplates.find((vt: string) => vt === t.id));
            }

            return templates;
        }
    }

    public async getSetting(runtime: ProjectRuntime, bindingType: string, settingName: string): Promise<ConfigSetting | undefined> {
        const binding: ConfigBinding | undefined = this._configMap[runtime].bindings.find((b: ConfigBinding) => b.bindingType === bindingType);
        if (binding) {
            return binding.settings.find((bs: ConfigSetting) => bs.name === settingName);
        } else {
            return undefined;
        }
    }
}

export async function tryGetTemplateDataFromCache(reporter: TelemetryReporter | undefined, globalState: vscode.Memento, cliFeedJson: cliFeedJsonResponse): Promise<TemplateData | undefined> {
    try {
        return <TemplateData | undefined>await callWithTelemetryAndErrorHandling('azureFunctions.tryGetTemplateDataFromCache', reporter, undefined, async function (this: IActionContext): Promise<TemplateData | undefined> {
            this.suppressErrorDisplay = true;
            this.properties.isActivationEvent = 'true';
            const templatesMap: { [runtime: string]: Template[] } = {};
            const configMap: { [runtime: string]: Config } = {};
            for (const key of Object.keys(ProjectRuntime)) {
                const runtime: ProjectRuntime = <ProjectRuntime>ProjectRuntime[key];
                const feedRuntime: string = getFeedRuntime(runtime);
                const currentRelease: string = cliFeedJson.tags[feedRuntime].release;
                const cachedRelease: string | undefined = globalState.get(`${runtime}-release`);
                if (!cachedRelease || gt(currentRelease, cachedRelease)) {
                    // templates are not up-to-date and need to be downloaded/extracted
                    return undefined;
                }

                const cachedResources: object | undefined = globalState.get<object>(getRuntimeKey(resourcesKey, runtime));
                const cachedTemplates: object[] | undefined = globalState.get<object[]>(getRuntimeKey(templatesKey, runtime));
                const cachedConfig: object | undefined = globalState.get<object>(getRuntimeKey(configKey, runtime));

                if (cachedResources && cachedTemplates && cachedConfig) {
                    [templatesMap[runtime], configMap[runtime]] = parseTemplates(cachedResources, cachedTemplates, cachedConfig);
                } else {
                    return undefined;
                }
            }

            return new TemplateData(templatesMap, configMap);
        });
    } catch (error) {
        return undefined;
    }
}

export async function tryGetLatestTemplateData(reporter: TelemetryReporter | undefined, cliFeedJson: cliFeedJsonResponse, globalState?: vscode.Memento): Promise<TemplateData | undefined> {
    try {
        return <TemplateData>await callWithTelemetryAndErrorHandling('azureFunctions.tryGetLatestTemplateData', reporter, undefined, async function (this: IActionContext): Promise<TemplateData> {
            this.suppressErrorDisplay = true;
            this.properties.isActivationEvent = 'true';
            const templatesMap: { [runtime: string]: Template[] } = {};
            const configMap: { [runtime: string]: Config } = {};

            for (const key of Object.keys(ProjectRuntime)) {
                const runtime: ProjectRuntime = <ProjectRuntime>ProjectRuntime[key];
                const feedRuntime: string = getFeedRuntime(runtime);
                const currentRelease: string = <string>cliFeedJson.tags[feedRuntime].release;
                await downloadAndExtractTemplates(cliFeedJson, currentRelease);

                // only Resources.json has a capital letter
                const rawResources: object = <object>await fse.readJSON(path.join(tempPath, 'resources', 'Resources.json'));
                const rawTemplates: object[] = <object[]>await fse.readJSON(path.join(tempPath, 'templates', 'templates.json'));
                const rawConfig: object = <object>await fse.readJSON(path.join(tempPath, 'bindings', 'bindings.json'));

                [templatesMap[runtime], configMap[runtime]] = parseTemplates(rawResources, rawTemplates, rawConfig);

                if (globalState) {
                    globalState.update(`${runtime}-release`, currentRelease);
                    globalState.update(getRuntimeKey(templatesKey, runtime), rawTemplates);
                    globalState.update(getRuntimeKey(configKey, runtime), rawConfig);
                    globalState.update(getRuntimeKey(resourcesKey, runtime), rawResources);
                }
            }
            return new TemplateData(templatesMap, configMap);
        });
    } catch (error) {
        return undefined;
    } finally {
        if (await fse.pathExists(tempPath)) {
            await fse.remove(tempPath);
        }
    }
}

export async function getTemplateDataFromBackup(reporter: TelemetryReporter | undefined, cliFeedJson: cliFeedJsonResponse, globalState?: vscode.Memento): Promise<TemplateData | undefined> {
    const releaseVersion: string | undefined = getFuncExtensionSetting(backupTemplateVersionSetting);
    if (!releaseVersion) {
        // the setting isn't set, just exit out
        return undefined;
    }

    try {
        return <TemplateData>await callWithTelemetryAndErrorHandling('azureFunctions.getTemplateDataFromBackup', reporter, undefined, async function (this: IActionContext): Promise<TemplateData | undefined> {
            this.suppressErrorDisplay = true;
            this.properties.isActivationEvent = 'true';
            const templatesMap: { [runtime: string]: Template[] } = {};
            const configMap: { [runtime: string]: Config } = {};
            const backupTemplateVersion: string = 'backupTemplateVersion';
            for (const key of Object.keys(ProjectRuntime)) {
                const runtime: ProjectRuntime = <ProjectRuntime>ProjectRuntime[key];
                // if the version cached is the same as the current setting, then get the cached templates
                if (globalState && globalState.get(backupTemplateVersion) === releaseVersion) {
                    const backupResources: object | undefined = globalState.get<object>(`${resourcesKey}-backupTemplate`);
                    const backupTemplates: object[] | undefined = globalState.get<object[]>(`${templatesKey}-backupTemplate`);
                    const backupConfig: object | undefined = globalState.get<object>(`${configKey}-backupTemplate`);
                    if (backupResources && backupTemplates && backupConfig) {
                        [templatesMap[runtime], configMap[runtime]] = parseTemplates(backupResources, backupTemplates, backupConfig);
                    } else {
                        return undefined;
                    }
                } else {
                    await downloadAndExtractTemplates(cliFeedJson, releaseVersion);
                    const rawResources: object = <object>await fse.readJSON(path.join(tempPath, 'resources', 'Resources.json'));
                    const rawTemplates: object[] = <object[]>await fse.readJSON(path.join(tempPath, 'templates', 'templates.json'));
                    const rawConfig: object = <object>await fse.readJSON(path.join(tempPath, 'bindings', 'bindings.json'));

                    [templatesMap[runtime], configMap[runtime]] = parseTemplates(rawResources, rawTemplates, rawConfig);

                    if (globalState) {
                        globalState.update(backupTemplateVersion, releaseVersion);
                        globalState.update(`${templatesKey}-backupTemplate`, rawTemplates);
                        globalState.update(`${configKey}-backupTemplate`, rawConfig);
                        globalState.update(`${resourcesKey}-backupTemplate`, rawResources);
                    }
                }
            }
            return new TemplateData(templatesMap, configMap);
        });
    } catch (error) {
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

function parseTemplates(rawResources: object, rawTemplates: object[], rawConfig: object): [Template[], Config] {
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

// tslint:disable-next-line:no-unsafe-any
async function downloadAndExtractTemplates(cliFeedJson: cliFeedJsonResponse, release: string): Promise<{}> {
    const zipFile: string = 'templates.zip';
    // tslint:disable-next-line:strict-boolean-expressions
    if (!cliFeedJson.releases[release]) {
        ext.outputChannel.appendLine(`v${release} is not a valid release version.`);
        throw new Error(`v${release} is not a valid release version.`);
    }
    const templateUrl: string = cliFeedJson.releases[release].templateApiZip;
    return new Promise(async (resolve: () => void, reject: (e: Error) => void): Promise<void> => {
        const templateOptions: request.OptionsWithUri = {
            method: 'GET',
            uri: templateUrl
        };

        await fse.ensureDir(tempPath);
        request(templateOptions, (err: Error) => {
            // tslint:disable-next-line:strict-boolean-expressions
            if (err) {
                reject(err);
            }
        }).pipe(fse.createWriteStream(path.join(tempPath, zipFile)).on('finish', () => {
            ext.outputChannel.appendLine(`Downloading v${release} templates zip file. . .`);
            // tslint:disable-next-line:no-unsafe-any
            extract(path.join(tempPath, zipFile), { dir: tempPath }, (err: Error) => {
                // tslint:disable-next-line:strict-boolean-expressions
                if (err) {
                    reject(err);
                }
                ext.outputChannel.appendLine('Template files extracted.');
                resolve();

            });
        }));
    });
}

function getFeedRuntime(runtime: ProjectRuntime): string {
    switch (runtime) {
        case ProjectRuntime.beta:
            return 'v2';
        case ProjectRuntime.one:
            return 'v1';
        default:
            throw new RangeError();
    }
}
