/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage } from '../../constants';
import { bundleFeedUtils } from '../../utils/bundleFeedUtils';
import { feedUtils } from '../../utils/feedUtils';
import { verifyTemplateIsV2 } from '../../utils/templateVersionUtils';
import { type IBindingTemplate } from '../IBindingTemplate';
import { type FunctionTemplateBase } from '../IFunctionTemplate';
import { type ITemplates } from '../ITemplates';
import { TemplateSchemaVersion, TemplateType } from '../TemplateProviderBase';
import { ScriptBundleTemplateProvider } from './ScriptBundleTemplateProvider';
import { getScriptResourcesLanguage } from './getScriptResourcesLanguage';
import { parseScriptTemplates, type RawTemplateV2 } from './parseScriptTemplatesV2';


export class PysteinTemplateProvider extends ScriptBundleTemplateProvider {
    public templateType: TemplateType = TemplateType.Script;
    public templateSchemaVersion: TemplateSchemaVersion = TemplateSchemaVersion.v2;

    protected get backupSubpath(): string {
        return path.join('pystein');
    }

    protected _resources: { en: { [key: string]: string } };
    protected _rawTemplates: RawTemplateV2[];
    protected _rawBindings: object[];
    protected _language: string;

    public async getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        const release = await bundleFeedUtils.getRelease(latestTemplateVersion, 'v2') as bundleFeedUtils.ITemplatesReleaseV2;
        const language = this.getResourcesLanguage();
        const resourcesUrl: string = release.resources.replace('{locale}', language);
        const urls: string[] = [release.userPrompts ?? release.bindings, resourcesUrl, release.functions];

        [this._rawBindings, this._resources, this._rawTemplates] = <[object[], { en: { [key: string]: string } }, RawTemplateV2[]]>await Promise.all(urls.map(url => feedUtils.getJsonFeed(context, url)));

        return {
            functionTemplates: parseScriptTemplates(this._rawTemplates, this._rawBindings, this._resources),
            // no bindings for V2 schema
            bindingTemplates: []
        }
    }

    public async getBackupTemplates(): Promise<ITemplates> {
        const paths: ITemplatePaths = this.getTemplatePaths(this.getBackupPath());
        this._rawTemplates = <RawTemplateV2[]>await AzExtFsExtra.readJSON(paths.templates);
        this._rawBindings = <object[]>await AzExtFsExtra.readJSON(paths.bindings);
        this._resources = await AzExtFsExtra.readJSON(paths.resources);

        return {
            functionTemplates: parseScriptTemplates(this._rawTemplates, this._rawBindings, this._resources),
            bindingTemplates: []
        }
    }

    public includeTemplate(template: FunctionTemplateBase | IBindingTemplate): boolean {
        if (verifyTemplateIsV2(template)) {
            return template.language.toLowerCase() === ProjectLanguage.Python.toLowerCase();
        }

        return false;
    }

    protected getResourcesLanguage(): string {
        return this.resourcesLanguage || getScriptResourcesLanguage();
    }

    protected getTemplatePaths(rootPath: string): ITemplatePaths {
        const templates: string = path.join(rootPath, 'templates-v2', 'templates.json');
        const bindings: string = path.join(rootPath, 'bindings-v2', 'userPrompts.json');
        const resources: string = path.join(rootPath, 'resources-v2', 'Resources.json');

        return { templates, bindings, resources };
    }
}


interface ITemplatePaths {
    templates: string;
    bindings: string;
    resources: string;
}
