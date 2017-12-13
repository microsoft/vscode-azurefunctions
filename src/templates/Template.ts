/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { FunctionConfig } from '../FunctionConfig';
import { ProjectLanguage } from '../ProjectSettings';
import * as fsUtil from '../utils/fs';
import { Resources } from './Resources';

interface ITemplate {
    id: string;
    // tslint:disable-next-line:no-reserved-keywords
    function: {};
    metadata: ITemplateMetadata;
    files: { [filename: string]: string };
}

interface ITemplateMetadata {
    defaultFunctionName: string;
    name: string;
    language: ProjectLanguage;
    userPrompt?: string[];
    category: TemplateCategory[];
}

export enum TemplateCategory {
    Core = '$temp_category_core'
}

export class Template {
    public readonly functionConfig: FunctionConfig;

    private _template: ITemplate;
    private _resources: Resources;
    constructor(template: object, resources: Resources) {
        this._template = <ITemplate>template;
        this._resources = resources;
        this.functionConfig = new FunctionConfig(this._template.function);
    }

    public get id(): string {
        return this._template.id;
    }

    public get name(): string {
        return this._resources.getValue(this._template.metadata.name);
    }

    public get defaultFunctionName(): string {
        return this._template.metadata.defaultFunctionName;
    }

    public get language(): ProjectLanguage {
        return this._template.metadata.language;
    }

    public isCategory(category: TemplateCategory): boolean {
        return this._template.metadata.category.find((c: TemplateCategory) => c === category) !== undefined;
    }

    public get userPromptedSettings(): string[] {
        return this._template.metadata.userPrompt ? this._template.metadata.userPrompt : [];
    }

    public async writeTemplateFiles(functionPath: string): Promise<void> {
        await fse.ensureDir(functionPath);
        const tasks: Promise<void>[] = Object.keys(this._template.files).map(async (fileName: string) => {
            await fse.writeFile(path.join(functionPath, fileName), this._template.files[fileName]);
        });

        tasks.push(fsUtil.writeFormattedJson(path.join(functionPath, 'function.json'), this._template.function));

        await Promise.all(tasks);
    }
}
