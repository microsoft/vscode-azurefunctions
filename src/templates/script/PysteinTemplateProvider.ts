/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage, pythonFunctionAppFileName, pythonFunctionBodyFileName } from '../../constants';
import { IBindingSetting, IBindingTemplate } from '../IBindingTemplate';
import { IFunctionTemplate } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { getScriptResourcesLanguage } from './getScriptResourcesLanguage';
import { IResources, IScriptFunctionTemplate, parseScriptSettingV2, parseScriptTemplates } from './parseScriptTemplates';

interface IRawTemplateV2 {
    actions: IAction[];
    author?: string;
    name: string;
    id?: string;
    description: string;
    programmingModel: 'v1' | 'v2';
    language: ProjectLanguage;
    jobs: IJob[]
    files: { [filename: string]: string };
}

interface IAction {
    name: string;
    type: string
    assignTo: string;
    filePath: string;
    continueOnError?: boolean;
    errorText?: string;
    source: string;
    createIfNotExists: boolean;
    replaceTokens: boolean;
}

interface IJob {
    actions: IAction[];
    condition: { name: string, expectedValue: string }
    inputs: IInput[];
    name: string;
    type: string;
}

export interface IInput {
    assignTo: string;
    defaultValue: string;
    paramId: string;
    required: boolean;
}

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
            && template.language === ProjectLanguage.Python
            && template.id.endsWith('-Python-Preview-Append');
    }

    protected async parseTemplates(rootPath: string): Promise<ITemplates> {
        const paths: ITemplatePaths = this.getTemplatePaths(rootPath);
        this._rawTemplates = <object[]>await AzExtFsExtra.readJSON(paths.templates);
        const templates: ITemplates = parseScriptTemplates({}, this._rawTemplates, {});

        const rawTemplatesV2 = <IRawTemplateV2[]>await AzExtFsExtra.readJSON(paths.templatesV2);
        // replace the function files with the V2 templates
        for (const templateV2 of rawTemplatesV2) {
            const pythonTemplateV1 = templates.functionTemplates.find(
                t => t.id === `${templateV2.id}-Preview-Append`) as IScriptFunctionTemplate;

            // to pick up the GA templates, we should be able to replace those properties in the templates
            if (pythonTemplateV1) {
                // template used for a new project
                pythonTemplateV1.templateFiles[pythonFunctionAppFileName] =
                    templateV2.files?.[pythonFunctionAppFileName] as string;
                // template used for appending to an existing project
                pythonTemplateV1.templateFiles[pythonFunctionBodyFileName] =
                    templateV2.files?.[pythonFunctionBodyFileName] as string;
                // old markdowns mention "preview" in them
                const markdownFileName = Object.keys(templateV2.files).find(key => key.includes('template.md'))
                if (markdownFileName) {
                    pythonTemplateV1.templateFiles[markdownFileName] = templateV2.files?.[markdownFileName] as string;
                }

                const inputs = templateV2?.jobs.find(j => j.type === 'AppendToFile')?.inputs;
                if (inputs) {
                    const userPrompts = await AzExtFsExtra.readJSON(paths.bindingsV2) as unknown as { label: string, id: string }[];
                    const resourcesV2 = await AzExtFsExtra.readJSON(paths.resourcesV2) as IResources;
                    // create the userPromptedSettings by using the "AppendToFile" inputs with the userPrompts which replaced the bindings.json
                    for (const input of inputs) {
                        const userPrompt = userPrompts.find(up => up.id.toLocaleLowerCase() === input.paramId.toLocaleLowerCase());
                        const userPromptedSetting: IBindingSetting = parseScriptSettingV2(userPrompt, resourcesV2, input);
                        pythonTemplateV1.userPromptedSettings.push(userPromptedSetting);
                    }
                }
            }
        }

        return templates;
    }

    protected getResourcesLanguage(): string {
        return this.resourcesLanguage || getScriptResourcesLanguage();
    }

    private getTemplatePaths(rootPath: string): ITemplatePaths {
        const templates: string = path.join(rootPath, 'templates', 'templates.json');
        const templatesV2: string = path.join(rootPath, 'templates-v2', 'templates.json');
        const bindingsV2: string = path.join(rootPath, 'bindings-v2', 'userPrompts.json');
        const resourcesV2: string = path.join(rootPath, 'resources-v2', 'Resources.json');

        return { templates, templatesV2, bindingsV2, resourcesV2 };
    }

    private isFunctionTemplate(template: IFunctionTemplate | IBindingTemplate): template is IFunctionTemplate {
        return (template as IFunctionTemplate).id !== undefined;
    }
}

interface ITemplatePaths {
    templates: string;
    templatesV2: string;
    bindingsV2: string;
    resourcesV2: string;
}
