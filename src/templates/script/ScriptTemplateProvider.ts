/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as extract from 'extract-zip';
import * as fse from 'fs-extra';
import * as path from 'path';
import { ext } from '../../extensionVariables';
import { FuncVersion } from '../../FuncVersion';
import { bundleFeedUtils } from '../../utils/bundleFeedUtils';
import { cliFeedUtils } from '../../utils/cliFeedUtils';
import { getRandomHexString } from '../../utils/fs';
import { requestUtils } from '../../utils/requestUtils';
import { IBindingTemplate } from '../IBindingTemplate';
import { IFunctionTemplate } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { english, getScriptResourcesLanguage } from './getScriptResourcesLanguage';
import { parseScriptTemplates } from './parseScriptTemplates';

export class ScriptTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Script;

    protected get backupSubpath(): string {
        return path.join('script', this.version);
    }

    protected _rawResources: object;
    protected _rawTemplates: object[];
    protected _rawBindings: object;

    private readonly _templatesKey: string = 'FunctionTemplates';
    private readonly _bindingsKey: string = 'FunctionTemplateConfig';
    private readonly _resourcesKey: string = 'FunctionTemplateResources';

    public async getCachedTemplates(): Promise<ITemplates | undefined> {
        const cachedResources: object | undefined = await this.getCachedValue(this._resourcesKey);
        const cachedTemplates: object[] | undefined = await this.getCachedValue(this._templatesKey);
        const cachedConfig: object | undefined = await this.getCachedValue(this._bindingsKey);
        if (cachedResources && cachedTemplates && cachedConfig) {
            return parseScriptTemplates(cachedResources, cachedTemplates, cachedConfig);
        } else {
            return undefined;
        }
    }

    public async getLatestTemplateVersion(context: IActionContext): Promise<string> {
        return await cliFeedUtils.getLatestVersion(context, this.version);
    }

    public async getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        const templateRelease: cliFeedUtils.IRelease = await cliFeedUtils.getRelease(context, latestTemplateVersion);

        const templatesPath: string = path.join(ext.context.globalStoragePath, 'script', getRandomHexString());
        try {
            const filePath: string = path.join(templatesPath, 'templates.zip');
            await requestUtils.downloadFile(context, templateRelease.templates, filePath);

            await extract(filePath, { dir: templatesPath });

            return await this.parseTemplates(templatesPath);
        } finally {
            if (await fse.pathExists(templatesPath)) {
                await fse.remove(templatesPath);
            }
        }
    }

    public async getBackupTemplates(): Promise<ITemplates> {
        return await this.parseTemplates(this.getBackupPath());
    }

    public async updateBackupTemplates(): Promise<void> {
        const paths: ITemplatePaths = this.getTemplatePaths(this.getBackupPath());
        const fileData: [string, object][] = [[paths.resources, this._rawResources], [paths.templates, this._rawTemplates], [paths.bindings, this._rawBindings]];
        for (const [file, data] of fileData) {
            await fse.ensureFile(file);
            await fse.writeJSON(file, data);
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async cacheTemplates(): Promise<void> {
        await this.updateCachedValue(this._templatesKey, this._rawTemplates);
        await this.updateCachedValue(this._bindingsKey, this._rawBindings);
        await this.updateCachedValue(this._resourcesKey, this._rawResources);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async clearCachedTemplates(): Promise<void> {
        await this.deleteCachedValue(this._templatesKey);
        await this.deleteCachedValue(this._bindingsKey);
        await this.deleteCachedValue(this._resourcesKey);
    }

    public includeTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        return this.version === FuncVersion.v1 || !bundleFeedUtils.isBundleTemplate(template);
    }

    protected async parseTemplates(rootPath: string): Promise<ITemplates> {
        const paths: ITemplatePaths = this.getTemplatePaths(rootPath);
        this._rawResources = <object>await fse.readJSON(paths.resources);
        this._rawTemplates = <object[]>await fse.readJSON(paths.templates);
        this._rawBindings = <object>await fse.readJSON(paths.bindings);
        return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawBindings);
    }

    protected getResourcesLanguage(): string {
        return this.resourcesLanguage || getScriptResourcesLanguage();
    }

    private getTemplatePaths(rootPath: string): ITemplatePaths {
        const language: string = this.getResourcesLanguage();
        // Unlike templates.json and bindings.json, Resources.json has a capital letter
        const resources: string = path.join(rootPath, 'resources', `Resources${language === english ? '' : '.' + language}.json`);
        const templates: string = path.join(rootPath, 'templates', 'templates.json');
        const bindings: string = path.join(rootPath, 'bindings', 'bindings.json');
        return { resources, templates, bindings };
    }
}

interface ITemplatePaths {
    resources: string;
    templates: string;
    bindings: string;
}
