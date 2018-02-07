/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
import * as vscode from 'vscode';
import { MessageItem } from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { DialogResponses } from '../DialogResponses';
import { IUserInterface } from '../IUserInterface';
import { localize } from '../localize';
import { ProjectLanguage, ProjectRuntime, selectProjectLanguage, selectProjectRuntime, selectTemplateFilter, TemplateFilter } from '../ProjectSettings';
import { VSCodeUI } from '../VSCodeUI';
import { Config } from './Config';
import { ConfigBinding } from './ConfigBinding';
import { ConfigSetting } from './ConfigSetting';
import { Resources } from './Resources';
import { Template, TemplateCategory } from './Template';

/**
 * Main container for all template data retrieved from the Azure Functions Portal. See README.md for more info and example of the schema.
 * We cache the template data retrieved from the portal so that the user can create functions offline.
 */
export class TemplateData {
    private readonly _templateInitError: Error = new Error(localize('azFunc.TemplateInitError', 'Failed to retrieve templates from the Azure Functions Portal.'));
    private readonly _templatesKey: string = 'FunctionTemplates';
    private readonly _configKey: string = 'FunctionTemplateConfig';
    private readonly _resourcesKey: string = 'FunctionTemplateResources';
    private readonly _refreshTask: Promise<void>;
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

    constructor(globalState?: vscode.Memento) {
        if (globalState) {
            for (const key of Object.keys(ProjectRuntime)) {
                const runtime: ProjectRuntime = <ProjectRuntime>ProjectRuntime[key];
                const cachedResources: object | undefined = globalState.get<object>(this.getRuntimeKey(this._resourcesKey, runtime));
                const cachedTemplates: object[] | undefined = globalState.get<object[]>(this.getRuntimeKey(this._templatesKey, runtime));
                const cachedConfig: object | undefined = globalState.get<object>(this.getRuntimeKey(this._configKey, runtime));

                if (cachedResources && cachedTemplates && cachedConfig) {
                    this.parseTemplates(runtime, cachedResources, cachedTemplates, cachedConfig);
                }
            }
        }

        this._refreshTask = this.refreshTemplates(globalState);
    }

    public async getTemplates(projectPath: string, language: string, runtime: string = ProjectRuntime.one, templateFilter?: string, ui: IUserInterface = new VSCodeUI()): Promise<Template[]> {
        if (this._templatesMap[runtime] === undefined) {
            await this._refreshTask;
            if (this._templatesMap[runtime] === undefined) {
                throw this._templateInitError;
            }
        }

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

            if (templates.length > 0) {
                return templates;
            } else {
                const message: string = localize('NoTemplatesError', 'No templates found matching language "{0}", runtime "{1}", and filter "{2}". Update settings?', language, runtime, templateFilter);
                const result: MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.cancel);
                if (result !== DialogResponses.yes) {
                    throw new UserCancelledError();
                } else {
                    language = await selectProjectLanguage(projectPath, ui);
                    runtime = await selectProjectRuntime(projectPath, ui);
                    templateFilter = await selectTemplateFilter(projectPath, ui);

                    // Try to get templates again
                    return await this.getTemplates(projectPath, language, runtime, templateFilter, ui);
                }
            }
        }
    }

    public async getSetting(runtime: ProjectRuntime, bindingType: string, settingName: string): Promise<ConfigSetting | undefined> {
        if (this._configMap[runtime] === undefined) {
            await this._refreshTask;
            if (this._configMap[runtime] === undefined) {
                throw this._templateInitError;
            }
        }

        const binding: ConfigBinding | undefined = this._configMap[runtime].bindings.find((b: ConfigBinding) => b.bindingType === bindingType);
        if (binding) {
            return binding.settings.find((bs: ConfigSetting) => bs.name === settingName);
        } else {
            return undefined;
        }
    }

    private async refreshTemplates(globalState?: vscode.Memento): Promise<void> {
        try {
            for (const key of Object.keys(ProjectRuntime)) {
                const runtime: ProjectRuntime = <ProjectRuntime>ProjectRuntime[key];

                const rawResources: object = await this.requestFunctionPortal<object>('resources', runtime, 'name=en-us');
                const rawTemplates: object[] = await this.requestFunctionPortal<object[]>('templates', runtime);
                const rawConfig: object = await this.requestFunctionPortal<object>('bindingconfig', runtime);

                this.parseTemplates(runtime, rawResources, rawTemplates, rawConfig);

                if (globalState) {
                    globalState.update(this.getRuntimeKey(this._templatesKey, runtime), rawTemplates);
                    globalState.update(this.getRuntimeKey(this._configKey, runtime), rawConfig);
                    globalState.update(this.getRuntimeKey(this._resourcesKey, runtime), rawResources);
                }
            }
        } catch (error) {
            // ignore errors - use cached version of templates instead
        }
    }

    private getRuntimeKey(baseKey: string, runtime: ProjectRuntime): string {
        return runtime === ProjectRuntime.one ? baseKey : `${baseKey}.${runtime}`;
    }

    private async requestFunctionPortal<T>(subpath: string, runtime: string, param?: string): Promise<T> {
        const options: request.OptionsWithUri = {
            method: 'GET',
            uri: `https://functions.azure.com/api/${subpath}?runtime=${runtime}&${param}`,
            headers: {
                'User-Agent': 'Mozilla/5.0' // Required otherwise we get Unauthorized
            }
        };

        return <T>(JSON.parse(await <Thenable<string>>request(options).promise()));
    }

    private parseTemplates(runtime: ProjectRuntime, rawResources: object, rawTemplates: object[], rawConfig: object): void {
        const resources: Resources = new Resources(rawResources);
        this._templatesMap[runtime] = [];
        for (const rawTemplate of rawTemplates) {
            try {
                this._templatesMap[runtime].push(new Template(rawTemplate, resources));
            } catch (error) {
                // Ignore errors so that a single poorly formed template does not affect other templates
            }
        }
        this._configMap[runtime] = new Config(rawConfig, resources);
    }
}

export function removeLanguageFromId(id: string): string {
    return id.split('-')[0];
}
