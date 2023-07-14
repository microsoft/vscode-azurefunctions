/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { IBindingTemplate } from '../IBindingTemplate';
import { IFunctionTemplate } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { getScriptResourcesLanguage } from '../script/getScriptResourcesLanguage';
import { parseScriptTemplates } from '../script/parseScriptTemplates';

export class BallerinaTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Ballerina;

    protected get backupSubpath(): string {
        return path.join('ballerina');
    }

    protected _rawResources: object;
    protected _rawTemplates: object[];
    protected _rawBindings: object;

    public async getCachedTemplates(): Promise<ITemplates | undefined> {
        return await this.getBackupTemplates();
    }

    public async getLatestTemplateVersion(_context: IActionContext): Promise<string> {
        return '1.0';
    }

    public async getLatestTemplates(_context: IActionContext, _latestTemplateVersion: string): Promise<ITemplates> {
        return await this.getBackupTemplates();
    }

    public async getBackupTemplates(): Promise<ITemplates> {
        return await this.parseTemplates(this.getBackupPath());
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

    public includeTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        return this.isFunctionTemplate(template)
            && template.language === this.language
            && !!template.triggerType
    }

    protected async parseTemplates(rootPath: string): Promise<ITemplates> {
        const paths: ITemplatePaths = this.getTemplatePaths(rootPath);
        this._rawTemplates = await AzExtFsExtra.readJSON<object[]>(paths.templates);
        this._rawBindings = await AzExtFsExtra.readJSON<object>(paths.bindings);
        this._rawResources = await AzExtFsExtra.readJSON<object>(paths.resources);

        return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawBindings);
    }

    protected getResourcesLanguage(): string {
        return this.resourcesLanguage || getScriptResourcesLanguage();
    }

    private getTemplatePaths(rootPath: string): ITemplatePaths {
        const resources: string = path.join(rootPath, 'resources', `Resources.json`);
        const templates: string = path.join(rootPath, 'templates', 'templates.json');
        const bindings: string = path.join(rootPath, 'bindings', 'bindings.json');
        return { resources, templates, bindings };
    }

    private isFunctionTemplate(template: IFunctionTemplate | IBindingTemplate): template is IFunctionTemplate {
        return (template as IFunctionTemplate).id !== undefined;
    }
}

interface ITemplatePaths {
    resources: string;
    templates: string;
    bindings: string;
}
