/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as fsUtil from '../utils/fs';
import { Resources } from './Resources';

interface ITemplate {
    id: string;
    // tslint:disable-next-line:no-reserved-keywords
    function: ITemplateFunction;
    metadata: ITemplateMetadata;
    files: { [filename: string]: string };
}

interface ITemplateFunction {
    disabled: boolean;
    bindings: { [propertyName: string]: string }[];
}

interface ITemplateMetadata {
    defaultFunctionName: string;
    name: string;
    language: TemplateLanguage;
    userPrompt?: string[];
    category: TemplateCategory[];
}

export enum TemplateLanguage {
    JavaScript = 'JavaScript',
    Java = 'Java'
}

export enum TemplateCategory {
    Core = '$temp_category_core'
}

export class Template {
    private _template: ITemplate;
    private _resources: Resources;
    constructor(template: object, resources: Resources) {
        this._template = <ITemplate>template;
        this._resources = resources;
    }

    public get name(): string {
        return this._resources.getValue(this._template.metadata.name);
    }

    public get defaultFunctionName(): string {
        return this._template.metadata.defaultFunctionName;
    }

    public get language(): TemplateLanguage {
        return this._template.metadata.language;
    }

    public isCategory(category: TemplateCategory): boolean {
        return this._template.metadata.category.find((c: TemplateCategory) => c === category) !== undefined;
    }

    public get bindingType(): string {
        // The first binding is the 'input' binding that matters for userInput
        return this._template.function.bindings[0].type;
    }

    public get userPromptedSettings(): string[] {
        return this._template.metadata.userPrompt ? this._template.metadata.userPrompt : [];
    }

    public getSetting(name: string): string | undefined {
        // The first binding is the 'input' binding that matters for userInput
        return this._template.function.bindings[0][name];
    }

    public setSetting(name: string, value?: string): void {
        // The first binding is the 'input' binding that matters for userInput
        this._template.function.bindings[0][name] = value ? value : '';
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
