/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage } from '../../constants';
import { IBindingTemplate } from '../IBindingTemplate';
import { IFunctionTemplate } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { getScriptResourcesLanguage } from './getScriptResourcesLanguage';
import { IScriptFunctionTemplate, parseScriptTemplates } from './parseScriptTemplates';

export class PysteinTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Script;

    protected get backupSubpath(): string {
        return path.join('pystein');
    }

    protected _rawTemplates: object[];

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

    public async getProjectTemplate(): Promise<IScriptFunctionTemplate | undefined> {
        const templates = await this.getBackupTemplates();

        // Find the first Python Preview project root template...
        return templates.functionTemplates.find(template =>
            template.language === ProjectLanguage.Python
            && template.id.endsWith('-Python-Preview')
            && template.categoryStyle === 'projectroot') as IScriptFunctionTemplate;
    }

    public async updateBackupTemplates(): Promise<void> {
        await Promise.resolve();
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async cacheTemplates(): Promise<void> {
        await Promise.resolve();
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async clearCachedTemplates(): Promise<void> {
        await Promise.resolve();
    }

    public includeTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        return this.isFunctionTemplate(template)
            && template.language === ProjectLanguage.Python
            && template.id.endsWith('-Python-Preview-Append');
    }

    protected async parseTemplates(rootPath: string): Promise<ITemplates> {
        const paths: ITemplatePaths = this.getTemplatePaths(rootPath);
        this._rawTemplates = <object[]>await fse.readJSON(paths.templates);
        return parseScriptTemplates({}, this._rawTemplates, {});
    }

    protected getResourcesLanguage(): string {
        return this.resourcesLanguage || getScriptResourcesLanguage();
    }

    private getTemplatePaths(rootPath: string): ITemplatePaths {
        const templates: string = path.join(rootPath, 'templates', 'templates.json');
        return { templates };
    }

    private isFunctionTemplate(template: IFunctionTemplate | IBindingTemplate): template is IFunctionTemplate {
        return (template as IFunctionTemplate).id !== undefined;
    }
}

interface ITemplatePaths {
    templates: string;
}
