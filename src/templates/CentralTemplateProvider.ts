/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, parseError } from 'vscode-azureextensionui';
import { ProjectLanguage, TemplateFilter } from '../constants';
import { ext, TemplateSource } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { DotnetTemplateProvider } from './dotnet/DotnetTemplateProvider';
import { getDotnetVerifiedTemplateIds } from './dotnet/getDotnetVerifiedTemplateIds';
import { IBindingTemplate } from './IBindingTemplate';
import { IFunctionTemplate, TemplateCategory } from './IFunctionTemplate';
import { ITemplates } from './ITemplates';
import { getJavaVerifiedTemplateIds } from './java/getJavaVerifiedTemplateIds';
import { JavaTemplateProvider } from './java/JavaTemplateProvider';
import { getScriptVerifiedTemplateIds } from './script/getScriptVerifiedTemplateIds';
import { IScriptFunctionTemplate } from './script/parseScriptTemplates';
import { ScriptBundleTemplateProvider } from './script/ScriptBundleTemplateProvider';
import { ScriptTemplateProvider } from './script/ScriptTemplateProvider';
import { TemplateProviderBase } from './TemplateProviderBase';

export class CentralTemplateProvider {
    public readonly templateSource: TemplateSource | undefined;
    private readonly _templatesTaskMap: { [key: string]: Promise<ITemplates> | undefined } = {};

    public constructor(templateSource?: TemplateSource) {
        this.templateSource = templateSource;
    }

    public static getProviders(projectPath: string | undefined, language: ProjectLanguage, version: FuncVersion): TemplateProviderBase[] {
        const providers: TemplateProviderBase[] = [];
        switch (language) {
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                providers.push(new DotnetTemplateProvider(version, projectPath));
                break;
            case ProjectLanguage.Java:
                providers.push(new JavaTemplateProvider(version, projectPath));
                break;
            default:
                providers.push(new ScriptTemplateProvider(version, projectPath));
                if (version !== FuncVersion.v1) {
                    providers.push(new ScriptBundleTemplateProvider(version, projectPath));
                }
                break;
        }
        return providers;
    }

    public async getFunctionTemplates(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, version: FuncVersion, templateFilter?: TemplateFilter): Promise<IFunctionTemplate[]> {
        const templates: ITemplates = await this.getTemplates(context, projectPath, language, version);
        const functionTemplates: IFunctionTemplate[] = templates.functionTemplates.filter((t: IFunctionTemplate) => t.language.toLowerCase() === language.toLowerCase());
        switch (templateFilter) {
            case TemplateFilter.All:
                return functionTemplates;
            case TemplateFilter.Core:
                return functionTemplates.filter((t: IFunctionTemplate) => t.categories.find((c: TemplateCategory) => c === TemplateCategory.Core) !== undefined);
            case TemplateFilter.Verified:
            default:
                const verifiedTemplateIds: string[] = getScriptVerifiedTemplateIds(version).concat(getDotnetVerifiedTemplateIds(version)).concat(getJavaVerifiedTemplateIds());
                return functionTemplates.filter((t: IFunctionTemplate) => verifiedTemplateIds.find((vt: string) => vt === t.id));
        }
    }

    public async clearTemplateCache(projectPath: string | undefined, language: ProjectLanguage, version: FuncVersion): Promise<void> {
        const providers: TemplateProviderBase[] = CentralTemplateProvider.getProviders(projectPath, language, version);
        for (const provider of providers) {
            await provider.deleteCachedValue(TemplateProviderBase.templateVersionKey);
            await provider.clearCache();
        }
        const key: string = this.getProviderTaskKey(providers, version);
        this._templatesTaskMap[key] = undefined;
    }

    public async getBindingTemplates(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, version: FuncVersion): Promise<IBindingTemplate[]> {
        const templates: ITemplates = await this.getTemplates(context, projectPath, language, version);
        return templates.bindingTemplates;
    }

    public async tryGetSampleData(context: IActionContext, version: FuncVersion, triggerBindingType: string): Promise<string | undefined> {
        try {
            const templates: IScriptFunctionTemplate[] = <IScriptFunctionTemplate[]>await this.getFunctionTemplates(context, undefined, ProjectLanguage.JavaScript, version, TemplateFilter.All);
            const template: IScriptFunctionTemplate | undefined = templates.find(t => t.functionJson.triggerBinding?.type?.toLowerCase() === triggerBindingType.toLowerCase());
            return template?.templateFiles['sample.dat'];
        } catch {
            return undefined;
        }
    }

    private getProviderTaskKey(providers: TemplateProviderBase[], version: FuncVersion): string {
        let key: string = version;
        for (const provider of providers) {
            key += provider.templateType;
        }
        return key;
    }

    /**
     * Ensures we only have one task going at a time for refreshing templates
     */
    private async getTemplates(context: IActionContext, projectPath: string | undefined, language: ProjectLanguage, version: FuncVersion): Promise<ITemplates> {
        const providers: TemplateProviderBase[] = CentralTemplateProvider.getProviders(projectPath, language, version);

        const key: string = this.getProviderTaskKey(providers, version);

        context.telemetry.properties.projectRuntime = version;
        context.telemetry.properties.projectLanguage = language;

        let templatesTask: Promise<ITemplates> | undefined = this._templatesTaskMap[key];
        if (templatesTask) {
            return await templatesTask;
        } else {
            templatesTask = this.refreshTemplates(context, providers);
            this._templatesTaskMap[key] = templatesTask;
            try {
                return await templatesTask;
            } catch (error) {
                // If an error occurs, we want to start from scratch next time we try to get templates so remove this task from the map
                delete this._templatesTaskMap[key];
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
            const latestTemplateVersion: string = await provider.getLatestTemplateVersion();
            context.telemetry.properties.latestTemplateVersion = latestTemplateVersion;

            const cachedTemplateVersion: string | undefined = await provider.getCachedTemplateVersion();
            context.telemetry.properties.cachedTemplateVersion = cachedTemplateVersion;

            // 1. Use the cached templates if they match latestTemplateVersion
            if (cachedTemplateVersion === latestTemplateVersion) {
                result = await this.tryGetCachedTemplates(context, provider);
            }

            // 2. Refresh templates if the cache doesn't match latestTemplateVersion
            if (!result) {
                result = await this.getLatestTemplates(context, provider, latestTemplateVersion);
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
                functionTemplates: result.functionTemplates.filter(f => provider.includeTemplate(f)),
                bindingTemplates: result.bindingTemplates.filter(b => provider.includeTemplate(b))
            };
        } else if (latestErrorMessage) {
            throw new Error(latestErrorMessage);
        } else {
            // This should only happen for dev/test scenarios where we explicitly set templateSource
            throw new Error(localize('templateSourceError', 'Internal error: Failed to get templates for source "{0}".', this.templateSource));
        }
    }

    private async getLatestTemplates(context: IActionContext, provider: TemplateProviderBase, latestTemplateVersion: string): Promise<ITemplates | undefined> {
        if (!this.templateSource || this.templateSource === TemplateSource.Latest || this.templateSource === TemplateSource.Staging) {
            context.telemetry.properties.templateSource = 'latest';
            const result: ITemplates = await provider.getLatestTemplates(context, latestTemplateVersion);
            await provider.updateCachedValue(TemplateProviderBase.templateVersionKey, latestTemplateVersion);
            await provider.cacheTemplates();
            return result;
        }

        return undefined;
    }

    private async tryGetCachedTemplates(context: IActionContext, provider: TemplateProviderBase): Promise<ITemplates | undefined> {
        if (!this.templateSource) {
            try {
                context.telemetry.properties.templateSource = 'cache';
                return await provider.getCachedTemplates(context);
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
                await provider.updateCachedValue(TemplateProviderBase.templateVersionKey, backupTemplateVersion);
                await provider.cacheTemplates();
                return result;
            } catch (error) {
                const errorMessage: string = parseError(error).message;
                ext.outputChannel.appendLog(localize('backupTemplatesError', 'Failed to get backup templates: {0}', errorMessage));
                context.telemetry.properties.backupTemplatesError = errorMessage;
            }
        }

        return undefined;
    }
}
