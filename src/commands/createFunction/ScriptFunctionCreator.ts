/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IUserInterface } from "../../IUserInterface";
import { localize } from "../../localize";
import { ProjectLanguage } from '../../ProjectSettings';
import { Template } from "../../templates/Template";
import * as fsUtil from '../../utils/fs';
import { FunctionCreatorBase } from './FunctionCreatorBase';

function getFileNameFromLanguage(language: string): string | undefined {
    switch (language) {
        case ProjectLanguage.Bash:
            return 'run.sh';
        case ProjectLanguage.Batch:
            return 'run.bat';
        case ProjectLanguage.CSharpScript:
            return 'run.csx';
        case ProjectLanguage.FSharpScript:
            return 'run.fsx';
        case ProjectLanguage.JavaScript:
            return 'index.js';
        case ProjectLanguage.PHP:
            return 'run.php';
        case ProjectLanguage.PowerShell:
            return 'run.ps1';
        case ProjectLanguage.Python:
            return 'run.py';
        case ProjectLanguage.TypeScript:
            return 'index.ts';
        default:
            return undefined;
    }
}

/**
 * Function creator for multiple languages that don't require compilation (JavaScript, C# Script, Bash, etc.)
 */
export class ScriptFunctionCreator extends FunctionCreatorBase {
    private _language: string;
    private _functionName: string;

    constructor(functionAppPath: string, template: Template, language: string) {
        super(functionAppPath, template);
        this._language = language;
    }

    public async promptForSettings(ui: IUserInterface, functionName: string | undefined): Promise<void> {
        if (!functionName) {
            const defaultFunctionName: string | undefined = await fsUtil.getUniqueFsPath(this._functionAppPath, this._template.defaultFunctionName);
            const prompt: string = localize('azFunc.funcNamePrompt', 'Provide a function name');
            const placeHolder: string = localize('azFunc.funcNamePlaceholder', 'Function name');
            this._functionName = await ui.showInputBox(placeHolder, prompt, (s: string) => this.validateTemplateName(s), defaultFunctionName || this._template.defaultFunctionName);
        } else {
            this._functionName = functionName;
        }
    }

    public async createFunction(userSettings: { [propertyName: string]: string; }): Promise<string | undefined> {
        const functionPath: string = path.join(this._functionAppPath, this._functionName);
        await fse.ensureDir(functionPath);
        await Promise.all(Object.keys(this._template.templateFiles).map(async (fileName: string) => {
            await fse.writeFile(path.join(functionPath, fileName), this._template.templateFiles[fileName]);
        }));

        for (const key of Object.keys(userSettings)) {
            this._template.functionConfig.inBinding[key] = userSettings[key];
        }
        await fsUtil.writeFormattedJson(path.join(functionPath, 'function.json'), this._template.functionConfig.functionJson);

        const mainFileName: string | undefined = getFileNameFromLanguage(this._language);
        if (mainFileName) {
            return path.join(functionPath, mainFileName);
        } else {
            return undefined;
        }
    }

    private validateTemplateName(name: string | undefined): string | undefined {
        if (!name) {
            return localize('azFunc.emptyTemplateNameError', 'The template name cannot be empty.');
        } else if (fse.existsSync(path.join(this._functionAppPath, name))) {
            return localize('azFunc.existingFolderError', 'A folder with the name \'{0}\' already exists.', name);
        } else if (!this._functionNameRegex.test(name)) {
            return localize('azFunc.functionNameInvalidError', 'Function name must start with a letter and can contain letters, digits, \'_\' and \'-\'');
        } else {
            return undefined;
        }
    }
}
