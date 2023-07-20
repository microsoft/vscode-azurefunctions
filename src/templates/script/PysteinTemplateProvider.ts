/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage } from '../../constants';
import { IBundleMetadata } from '../../funcConfig/host';
import { bundleFeedUtils } from '../../utils/bundleFeedUtils';
import { feedUtils } from '../../utils/feedUtils';
import { FunctionV2Template } from '../FunctionTemplateV2';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { getScriptResourcesLanguage } from './getScriptResourcesLanguage';
import { RawTemplateV2, parseScriptTemplates } from './parseScriptTemplatesV2';


export class PysteinTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Script;

    protected get backupSubpath(): string {
        return path.join('pystein');
    }

    protected _resources: { en: { [key: string]: string } };
    protected _rawTemplates: RawTemplateV2[];
    protected _rawBindings: object[];
    protected _language: string;
    // TODO: Remove hardcoded language
    public resourcesLanguage: string = 'en';

    public async getCachedTemplates(): Promise<ITemplates | undefined> {
        return await this.getBackupTemplates();
    }

    public async getLatestTemplateVersion(_context: IActionContext): Promise<string> {
        return '1.0.0';
    }

    public async getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        return await this.getBackupTemplates();
        // just use backup templates until template feed deploys v2 templates
        const bundleMetadata: IBundleMetadata | undefined = await this.getBundleInfo();
        const release: bundleFeedUtils.ITemplatesReleaseV2 = await bundleFeedUtils.getReleaseV2(context, bundleMetadata, latestTemplateVersion);
        this._language = this.getResourcesLanguage();
        const resourcesUrl: string = release.resources.replace('{locale}', this.language);
        const urls: string[] = [release.userPrompts, resourcesUrl, release.functions];

        [this._rawBindings, this._resources, this._rawTemplates] = <[object[], { en: { [key: string]: string } }, RawTemplateV2[]]>await Promise.all(urls.map(url => feedUtils.getJsonFeed(context, url)));

        return {
            functionTemplates: [],
            functionTemplatesV2: parseScriptTemplates(this._rawTemplates, this._rawBindings, this._resources),
            bindingTemplates: []
        }
    }

    public async getBackupTemplates(): Promise<ITemplates> {
        const paths: ITemplatePaths = this.getTemplatePaths(this.getBackupPath());
        this._rawTemplates = <RawTemplateV2[]>await AzExtFsExtra.readJSON(paths.templates);
        this._rawBindings = <object[]>await AzExtFsExtra.readJSON(paths.bindings);
        this._resources = await AzExtFsExtra.readJSON(paths.resources);

        const functionTemplatesV2 = parseScriptTemplates(this._rawTemplates, this._rawBindings, this._resources);

        return {
            functionTemplates: [],
            functionTemplatesV2,
            bindingTemplates: []
        }
    }

    public async updateBackupTemplates(): Promise<void> {
        // NOTE: No-op as the templates are only bundled with this extension.
        await Promise.resolve();
    }

    public async cacheTemplates(): Promise<void> {
        // NOTE: No-op as the templates are only bundled with this extension.
        await Promise.resolve();
    }

    public async clearCachedTemplates(): Promise<void> {
        // NOTE: No-op as the templates are only bundled with this extension.
        await Promise.resolve();
    }

    public includeTemplate(template: FunctionV2Template): boolean {
        return template.language.toLowerCase() === ProjectLanguage.Python.toLowerCase()
            && template.programmingModel === 'v2';
    }

    protected getResourcesLanguage(): string {
        return this.resourcesLanguage || getScriptResourcesLanguage();
    }

    private getTemplatePaths(rootPath: string): ITemplatePaths {
        const templates: string = path.join(rootPath, 'templates-v2', 'templates.json');
        const bindings: string = path.join(rootPath, 'bindings-v2', 'userPrompts.json');
        const resources: string = path.join(rootPath, 'resources-v2', 'Resources.json');

        return { templates, bindings, resources };
    }

    private async getBundleInfo(): Promise<IBundleMetadata | undefined> {
        // hard-code this for now, but this should be retrieved from the template feed at some point
        return {
            "id": "Microsoft.Azure.Functions.ExtensionBundle",
            "version": "[4.*, 5.0.0)"
        }
    }
}


interface ITemplatePaths {
    templates: string;
    bindings: string;
    resources: string;
}
