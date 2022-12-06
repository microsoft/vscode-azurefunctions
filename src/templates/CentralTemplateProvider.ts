/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, parseError } from '@microsoft/vscode-azext-utils';
import { ConfigurationChangeEvent, Disposable, workspace } from 'vscode';
import { ProjectLanguage, projectTemplateKeySetting, TemplateFilter } from '../constants';
import { ext, TemplateSource } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { delay } from '../utils/delay';
import { nonNullValue } from '../utils/nonNull';
import { pythonUtils } from '../utils/pythonUtils';
import { requestUtils } from '../utils/requestUtils';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { DotnetTemplateProvider } from './dotnet/DotnetTemplateProvider';
import { getDotnetVerifiedTemplateIds } from './dotnet/getDotnetVerifiedTemplateIds';
import { IBindingTemplate } from './IBindingTemplate';
import { IFunctionTemplate, TemplateCategory } from './IFunctionTemplate';
import { ITemplates } from './ITemplates';
import { getJavaVerifiedTemplateIds } from './java/getJavaVerifiedTemplateIds';
import { JavaTemplateProvider } from './java/JavaTemplateProvider';
import { getScriptVerifiedTemplateIds } from './script/getScriptVerifiedTemplateIds';
import { IScriptFunctionTemplate } from './script/parseScriptTemplates';
import { PysteinTemplateProvider } from './script/PysteinTemplateProvider';
import { ScriptBundleTemplateProvider } from './script/ScriptBundleTemplateProvider';
import { ScriptTemplateProvider } from './script/ScriptTemplateProvider';
import { TemplateProviderBase } from './TemplateProviderBase';

type CachedProviders = { providers: TemplateProviderBase[]; templatesTask?: Promise<ITemplates> }

export class CentralTemplateProvider implements Disposable {
    public readonly templateSource: TemplateSource | undefined;
    private readonly _providersMap = new Map<string, CachedProviders>();
    private _disposables: Disposable[] = [];

    public constructor(templateSource?: TemplateSource) {
        this.templateSource = templateSource || getWorkspaceSetting('templateSource');
        this._disposables.push(workspace.onDidChangeConfiguration(e => this.onConfigChanged(e)));
    }

    public dispose(): void {
        const allProviders: TemplateProviderBase[] = [];
        for (const p of this._providersMap.values()) {
            allProviders.push(...p.providers);
        }
        Disposable.from(...allProviders, ...this._disposables).dispose();
        this._providersMap.clear();
    }

    public static getProviders(projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion, projectTemplateKey: string | undefined): TemplateProviderBase[] {
        const providers: TemplateProviderBase[] = [];
        switch (language) {
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                providers.push(new DotnetTemplateProvider(version, projectPath, language, projectTemplateKey));
                break;
            case ProjectLanguage.Java:
                providers.push(new JavaTemplateProvider(version, projectPath, language, projectTemplateKey));
                break;
            default:
                if (pythonUtils.isV2Plus(language, languageModel)) {
                    providers.push(new PysteinTemplateProvider(version, projectPath, language, projectTemplateKey));
                } else {
                    providers.push(new ScriptTemplateProvider(version, projectPath, language, projectTemplateKey));
                    if (version !== FuncVersion.v1) {
                        providers.push(new ScriptBundleTemplateProvider(version, projectPath, language, projectTemplateKey));
                    }
                }
                break;
        }
        return providers;
    }

    public async getFunctionTemplates(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion, templateFilter: TemplateFilter, projectTemplateKey: string | undefined): Promise<IFunctionTemplate[]> {
        const templates: ITemplates = await this.getTemplates(context, projectPath, language, languageModel, version, projectTemplateKey);
        switch (templateFilter) {
            case TemplateFilter.All:
                return templates.functionTemplates;
            case TemplateFilter.Core:
                return templates.functionTemplates.filter((t: IFunctionTemplate) => t.categories.find((c: TemplateCategory) => c === TemplateCategory.Core) !== undefined);
            case TemplateFilter.Verified:
            default:
                const verifiedTemplateIds = getScriptVerifiedTemplateIds(version).concat(getDotnetVerifiedTemplateIds(version)).concat(getJavaVerifiedTemplateIds());
                return templates.functionTemplates.filter((t: IFunctionTemplate) => verifiedTemplateIds.find(vt => typeof vt === 'string' ? vt === t.id : vt.test(t.id)));
        }
    }

    public async clearTemplateCache(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion): Promise<void> {
        const providers: TemplateProviderBase[] = CentralTemplateProvider.getProviders(projectPath, language, languageModel, version, undefined);
        for (const provider of providers) {
            await provider.clearCachedTemplateMetadata();
            await provider.clearCachedTemplates(context);
            provider.projKeyMayHaveChanged();
        }
        const cachedProviders = this.tryGetCachedProviders(projectPath, language, languageModel, version);
        if (cachedProviders) {
            delete cachedProviders.templatesTask;
        }
    }

    public async getBindingTemplates(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion): Promise<IBindingTemplate[]> {
        const templates: ITemplates = await this.getTemplates(context, projectPath, language, languageModel, version, undefined);
        return templates.bindingTemplates;
    }

    public async tryGetSampleData(context: IActionContext, version: FuncVersion, triggerBindingType: string): Promise<string | undefined> {
        try {
            const templates: IScriptFunctionTemplate[] = <IScriptFunctionTemplate[]>await this.getFunctionTemplates(context, undefined, ProjectLanguage.JavaScript, undefined, version, TemplateFilter.All, undefined);
            const template: IScriptFunctionTemplate | undefined = templates.find(t => t.functionJson.triggerBinding?.type?.toLowerCase() === triggerBindingType.toLowerCase());
            return template?.templateFiles['sample.dat'];
        } catch {
            return undefined;
        }
    }

    public async getProjectTemplateKey(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion, projectTemplateKey: string | undefined): Promise<string> {
        const cachedProviders = await this.getCachedProviders(context, projectPath, language, languageModel, version, projectTemplateKey);
        // .NET is the only language that supports project template keys and they only have one provider
        // We probably need to do something better here once multi-provider languages support project template keys
        const provider = nonNullValue(cachedProviders.providers[0], 'firstProvider');
        return await provider.getProjKey(context);
    }

    private getCachedProvidersKey(language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion): string {
        // NOTE: VS Code treats lack of a language model project setting as a 0, so treat undefined === null === 0.
        return `${language}:${languageModel ?? 0}:${version}`;
    }

    private tryGetCachedProviders(projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion): CachedProviders | undefined {
        const key: string = this.getCachedProvidersKey(language, languageModel, version);
        if (this._providersMap.has(key)) {
            return this._providersMap.get(key);
        } else if (projectPath) {
            return this._providersMap.get(key + projectPath);
        } else {
            return undefined;
        }
    }

    private setCachedProviders(projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion, cachedProviders: CachedProviders): void {
        let key: string = this.getCachedProvidersKey(language, languageModel, version);
        if (cachedProviders.providers.some(p => p.supportsProjKey())) {
            key += projectPath;
        }
        this._providersMap.set(key, cachedProviders);
    }

    private async getCachedProviders(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion, projectTemplateKey: string | undefined): Promise<CachedProviders> {
        let cachedProviders = this.tryGetCachedProviders(projectPath, language, languageModel, version);
        if (!cachedProviders) {
            cachedProviders = { providers: CentralTemplateProvider.getProviders(projectPath, language, languageModel, version, projectTemplateKey) };
            this.setCachedProviders(projectPath, language, languageModel, version, cachedProviders);
        } else {
            await Promise.all(cachedProviders.providers.map(async p => {
                if (await p.updateProjKeyIfChanged(context, projectTemplateKey)) {
                    delete cachedProviders?.templatesTask;
                }
            }));
        }
        return cachedProviders;
    }

    /**
     * Ensures we only have one task going at a time for refreshing templates
     */
    private async getTemplates(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, languageModel: number | undefined, version: FuncVersion, projectTemplateKey: string | undefined): Promise<ITemplates> {
        context.telemetry.properties.projectRuntime = version;
        context.telemetry.properties.projectLanguage = language;

        const cachedProviders = await this.getCachedProviders(context, projectPath, language, languageModel, version, projectTemplateKey);
        let templatesTask: Promise<ITemplates> | undefined = cachedProviders.templatesTask;
        if (templatesTask) {
            return await templatesTask;
        } else {
            templatesTask = this.refreshTemplates(context, cachedProviders.providers);
            cachedProviders.templatesTask = templatesTask;
            try {
                return await templatesTask;
            } catch (error) {
                // If an error occurs, we want to start from scratch next time we try to get templates so remove this task from the map
                delete cachedProviders.templatesTask;
                throw error;
            }
        }
    }

    private async refreshTemplates(context: IActionContext, providers: TemplateProviderBase[]): Promise<ITemplates> {
        return (await Promise.all(providers.map(async provider => {
            return await this.refreshTemplatesForProvider(context, provider);
        }))).reduce((t1: ITemplates, t2: ITemplates) => {
            return {
                functionTemplates: t1.functionTemplates.concat(t2.functionTemplates),
                bindingTemplates: t1.bindingTemplates.concat(t2.bindingTemplates)
            };
        });
    }

    private async refreshTemplatesForProvider(context: IActionContext, provider: TemplateProviderBase): Promise<ITemplates> {
        let result: ITemplates | undefined;
        let latestErrorMessage: string | undefined;
        try {
            const latestTemplateVersion: string = await provider.getLatestTemplateVersion(context);
            context.telemetry.properties.latestTemplateVersion = latestTemplateVersion;

            const cachedTemplateVersion: string | undefined = await provider.getCachedTemplateVersion();
            context.telemetry.properties.cachedTemplateVersion = cachedTemplateVersion;

            // 1. Use the cached templates if they match latestTemplateVersion
            if (cachedTemplateVersion === latestTemplateVersion) {
                result = await this.tryGetCachedTemplates(context, provider);
            }

            // 2. Refresh templates if the cache doesn't match latestTemplateVersion
            if (!result) {
                const timeout = requestUtils.getRequestTimeoutMS();
                result = await Promise.race([
                    this.getLatestTemplates(context, provider, latestTemplateVersion),
                    delay(timeout).then(() => {
                        throw new Error(localize('templatesTimeout', 'Retrieving templates timed out. Modify setting "{0}.{1}" if you want to extend the timeout.', ext.prefix, requestUtils.timeoutKey));
                    })
                ]);
            }
        } catch (error) {
            const errorMessage: string = parseError(error).message;
            // This error should be the most actionable to the user, so save it and throw later if cache/backup doesn't work
            latestErrorMessage = localize('latestTemplatesError', 'Failed to get latest templates: {0}', errorMessage);
            ext.outputChannel.appendLog(latestErrorMessage);
            context.telemetry.properties.latestTemplatesError = errorMessage;
        }

        // 3. Use the cached templates, even if they don't match latestTemplateVersion
        if (!result) {
            result = await this.tryGetCachedTemplates(context, provider);
        }

        // 4. Use backup templates shipped with the extension
        if (!result) {
            result = await this.tryGetBackupTemplates(context, provider);
        }

        if (result) {
            return {
                functionTemplates: result.functionTemplates.filter(f => this.includeTemplate(provider, f)),
                bindingTemplates: result.bindingTemplates.filter(b => this.includeTemplate(provider, b))
            };
        } else if (latestErrorMessage) {
            throw new Error(latestErrorMessage);
        } else {
            // This should only happen for dev/test scenarios where we explicitly set templateSource
            throw new Error(localize('templateSourceError', 'Internal error: Failed to get templates for source "{0}".', this.templateSource));
        }
    }

    private includeTemplate(provider: TemplateProviderBase, template: IBindingTemplate | IFunctionTemplate): boolean {
        return provider.includeTemplate(template) && (!('language' in template) || template.language.toLowerCase() === provider.language.toLowerCase());
    }

    private async getLatestTemplates(context: IActionContext, provider: TemplateProviderBase, latestTemplateVersion: string): Promise<ITemplates | undefined> {
        if (!this.templateSource || this.templateSource === TemplateSource.Latest || this.templateSource === TemplateSource.Staging) {
            context.telemetry.properties.templateSource = 'latest';
            const result: ITemplates = await provider.getLatestTemplates(context, latestTemplateVersion);
            await provider.cacheTemplateMetadata(latestTemplateVersion);
            await provider.cacheTemplates(context);
            return result;
        }

        return undefined;
    }

    private async tryGetCachedTemplates(context: IActionContext, provider: TemplateProviderBase): Promise<ITemplates | undefined> {
        if (!this.templateSource) {
            try {
                context.telemetry.properties.templateSource = 'cache';
                if (await provider.doesCachedProjKeyMatch(context)) {
                    return await provider.getCachedTemplates(context);
                } else {
                    return undefined;
                }
            } catch (error) {
                const errorMessage: string = parseError(error).message;
                ext.outputChannel.appendLog(localize('cachedTemplatesError', 'Failed to get cached templates: {0}', errorMessage));
                context.telemetry.properties.cachedTemplatesError = errorMessage;
            }
        }

        return undefined;
    }

    private async tryGetBackupTemplates(context: IActionContext, provider: TemplateProviderBase): Promise<ITemplates | undefined> {
        if (!this.templateSource || this.templateSource === TemplateSource.Backup) {
            try {
                context.telemetry.properties.templateSource = 'backup';
                const backupTemplateVersion: string = await provider.getBackupTemplateVersion();
                context.telemetry.properties.backupTemplateVersion = backupTemplateVersion;
                const result: ITemplates = await provider.getBackupTemplates(context);
                await provider.cacheTemplateMetadata(backupTemplateVersion);
                await provider.cacheTemplates(context);
                return result;
            } catch (error) {
                const errorMessage: string = parseError(error).message;
                ext.outputChannel.appendLog(localize('backupTemplatesError', 'Failed to get backup templates: {0}', errorMessage));
                context.telemetry.properties.backupTemplatesError = errorMessage;
            }
        }

        return undefined;
    }

    private onConfigChanged(e: ConfigurationChangeEvent): void {
        if (e.affectsConfiguration(`${ext.prefix}.${projectTemplateKeySetting}`)) {
            for (const cached of this._providersMap.values()) {
                for (const provider of cached.providers) {
                    provider.projKeyMayHaveChanged();
                }
            }
        }
    }
}
