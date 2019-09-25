/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, parseError } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime, TemplateFilter } from '../constants';
import { ext, TemplateSource } from '../extensionVariables';
import { localize } from '../localize';
import { cliFeedJsonResponse, getCliFeedJson, getFeedRuntime } from '../utils/getCliFeedJson';
import { DotnetTemplateProvider } from './dotnet/DotnetTemplateProvider';
import { getDotnetVerifiedTemplateIds } from './dotnet/getDotnetVerifiedTemplateIds';
import { IBindingTemplate } from './IBindingTemplate';
import { IFunctionTemplate, TemplateCategory } from './IFunctionTemplate';
import { ITemplates } from './ITemplates';
import { JavaTemplateProvider } from './java/JavaTemplateProvider';
import { getScriptVerifiedTemplateIds } from './script/getScriptVerifiedTemplateIds';
import { ScriptTemplateProvider } from './script/ScriptTemplateProvider';
import { TemplateProviderBase } from './TemplateProviderBase';

export class CentralTemplateProvider {
    public readonly templateSource: TemplateSource | undefined;
    private readonly _templatesTaskMap: { [key: string]: Promise<ITemplates> | undefined } = {};

    public constructor(templateSource?: TemplateSource) {
        this.templateSource = templateSource;
    }

    public async getFunctionTemplates(context: IActionContext, language: ProjectLanguage, runtime: ProjectRuntime, templateFilter?: TemplateFilter): Promise<IFunctionTemplate[]> {
        const templates: ITemplates = await this.getTemplates(context, language, runtime);
        const functionTemplates: IFunctionTemplate[] = templates.functionTemplates.filter((t: IFunctionTemplate) => t.language.toLowerCase() === language.toLowerCase());
        switch (templateFilter) {
            case TemplateFilter.All:
                return functionTemplates;
            case TemplateFilter.Core:
                return functionTemplates.filter((t: IFunctionTemplate) => t.categories.find((c: TemplateCategory) => c === TemplateCategory.Core) !== undefined);
            case TemplateFilter.Verified:
            default:
                const verifiedTemplateIds: string[] = getScriptVerifiedTemplateIds(runtime).concat(getDotnetVerifiedTemplateIds(runtime));
                return functionTemplates.filter((t: IFunctionTemplate) => verifiedTemplateIds.find((vt: string) => vt === t.id));
        }
    }

    public async getBindingTemplates(context: IActionContext, language: ProjectLanguage, runtime: ProjectRuntime): Promise<IBindingTemplate[]> {
        const templates: ITemplates = await this.getTemplates(context, language, runtime);
        if (!templates.bindingTemplates) {
            throw new Error(localize('bindingTemplatesError', 'Binding templates are not supported for language "{0}" and runtime "{1}"', language, runtime));
        } else {
            return templates.bindingTemplates;
        }
    }

    /**
     * Ensures we only have one task going at a time for refreshing templates
     */
    private async getTemplates(context: IActionContext, language: ProjectLanguage, runtime: ProjectRuntime): Promise<ITemplates> {
        let provider: TemplateProviderBase;
        switch (language) {
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                provider = new DotnetTemplateProvider(runtime);
                break;
            case ProjectLanguage.Java:
                provider = new JavaTemplateProvider(runtime);
                break;
            default:
                provider = new ScriptTemplateProvider(runtime);
                break;
        }

        const key: string = provider.templateType + provider.runtime;
        let templatesTask: Promise<ITemplates> | undefined = this._templatesTaskMap[key];
        if (templatesTask) {
            return await templatesTask;
        } else {
            templatesTask = this.refreshTemplates(context, provider);
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

    private async refreshTemplates(context: IActionContext, provider: TemplateProviderBase): Promise<ITemplates> {
        context.telemetry.properties.runtime = provider.runtime;
        context.telemetry.properties.templateType = provider.templateType;

        let result: ITemplates | undefined;
        let latestTemplatesError: unknown;
        try {
            const cliFeedJson: cliFeedJsonResponse = await getCliFeedJson();
            const feedRuntime: string = getFeedRuntime(provider.runtime);
            const templateVersion: string = cliFeedJson.tags[feedRuntime].release;
            context.telemetry.properties.templateVersion = templateVersion;
            const cachedTemplateVersion: string | undefined = ext.context.globalState.get(provider.getCacheKey(TemplateProviderBase.templateVersionKey));
            context.telemetry.properties.cachedTemplateVersion = cachedTemplateVersion;

            // 1. Use the cached templates if they match templateVersion
            if (cachedTemplateVersion === templateVersion) {
                result = await this.tryGetCachedTemplates(context, provider);
            }

            // 2. Download templates from the cli-feed if the cache doesn't match templateVersion
            if (!result) {
                result = await this.getLatestTemplates(context, provider, cliFeedJson, templateVersion);
            }
        } catch (error) {
            // This error should be the most actionable to the user, so save it and throw later if cache/backup doesn't work
            latestTemplatesError = error;
            const errorMessage: string = parseError(error).message;
            ext.outputChannel.appendLog(localize('latestTemplatesError', 'Failed to get latest templates: {0}', errorMessage));
            context.telemetry.properties.latestTemplatesError = errorMessage;
        }

        // 3. Use the cached templates, even if they don't match templateVersion
        if (!result) {
            result = await this.tryGetCachedTemplates(context, provider);
        }

        // 4. Use backup templates shipped with the extension
        if (!result) {
            result = await this.tryGetBackupTemplates(context, provider);
        }

        if (result) {
            return result;
        } else if (latestTemplatesError !== undefined) {
            throw latestTemplatesError;
        } else {
            // This should only happen for dev/test scenarios where we explicitly set templateSource
            throw new Error(localize('templateSourceError', 'Internal error: Failed to get templates for source "{0}".', this.templateSource));
        }
    }

    private async getLatestTemplates(context: IActionContext, provider: TemplateProviderBase, cliFeedJson: cliFeedJsonResponse, templateVersion: string): Promise<ITemplates | undefined> {
        // tslint:disable-next-line:strict-boolean-expressions
        if (!this.templateSource || this.templateSource === TemplateSource.Latest || this.templateSource === TemplateSource.Staging) {
            context.telemetry.properties.templateSource = 'latest';
            const result: ITemplates = await provider.getLatestTemplates(cliFeedJson, templateVersion, context);
            ext.context.globalState.update(provider.getCacheKey(TemplateProviderBase.templateVersionKey), templateVersion);
            await provider.cacheTemplates();
            return result;
        }

        return undefined;
    }

    private async tryGetCachedTemplates(context: IActionContext, provider: TemplateProviderBase): Promise<ITemplates | undefined> {
        // tslint:disable-next-line:strict-boolean-expressions
        if (!this.templateSource) {
            try {
                context.telemetry.properties.templateSource = 'cache';
                return await provider.getCachedTemplates();
            } catch (error) {
                const errorMessage: string = parseError(error).message;
                ext.outputChannel.appendLog(localize('cachedTemplatesError', 'Failed to get cached templates: {0}', errorMessage));
                context.telemetry.properties.cachedTemplatesError = errorMessage;
            }
        }

        return undefined;
    }

    private async tryGetBackupTemplates(context: IActionContext, provider: TemplateProviderBase): Promise<ITemplates | undefined> {
        // tslint:disable-next-line:strict-boolean-expressions
        if (!this.templateSource || this.templateSource === TemplateSource.Backup) {
            try {
                context.telemetry.properties.templateSource = 'backup';
                const backupTemplateVersion: string = provider.getBackupVersion();
                const result: ITemplates = await provider.getBackupTemplates();
                ext.context.globalState.update(provider.getCacheKey(TemplateProviderBase.templateVersionKey), backupTemplateVersion);
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
