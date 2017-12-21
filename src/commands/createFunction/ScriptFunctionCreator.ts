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
import { IFunctionCreator } from './IFunctionCreator';

const functionNameRegex: RegExp = /^[a-zA-Z][a-zA-Z\d_\-]*$/;

function getFileNameFromLanguage(language: string): string | undefined {
    switch (language) {
        case ProjectLanguage.Bash:
            return 'run.sh';
        case ProjectLanguage.Batch:
            return 'run.bat';
        case ProjectLanguage.FSharp:
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
export class ScriptFunctionCreator implements IFunctionCreator {
    private _language: string;
    private _functionName: string;

    constructor(language: string) {
        this._language = language;
    }

    public async promptForSettings(functionAppPath: string, template: Template, ui: IUserInterface): Promise<void> {
        const defaultFunctionName: string | undefined = await fsUtil.getUniqueFsPath(functionAppPath, template.defaultFunctionName);
        const prompt: string = localize('azFunc.funcNamePrompt', 'Provide a function name');
        const placeHolder: string = localize('azFunc.funcNamePlaceholder', 'Function name');
        this._functionName = await ui.showInputBox(placeHolder, prompt, false, (s: string) => this.validateTemplateName(functionAppPath, s), defaultFunctionName || template.defaultFunctionName);
    }

    public async createFunction(functionAppPath: string, template: Template, userSettings: { [propertyName: string]: string; }): Promise<string | undefined> {
        const functionPath: string = path.join(functionAppPath, this._functionName);
        await fse.ensureDir(functionPath);
        await Promise.all(Object.keys(template.templateFiles).map(async (fileName: string) => {
            await fse.writeFile(path.join(functionPath, fileName), template.templateFiles[fileName]);
        }));

        for (const key of Object.keys(userSettings)) {
            template.functionConfig.inBinding[key] = userSettings[key];
        }
        await fsUtil.writeFormattedJson(path.join(functionPath, 'function.json'), template.functionConfig.functionJson);

        const mainFileName: string | undefined = getFileNameFromLanguage(this._language);
        if (mainFileName) {
            return path.join(functionPath, mainFileName);
        } else {
            return undefined;
        }
    }

    private validateTemplateName(rootPath: string, name: string | undefined): string | undefined {
        if (!name) {
            return localize('azFunc.emptyTemplateNameError', 'The template name cannot be empty.');
        } else if (fse.existsSync(path.join(rootPath, name))) {
            return localize('azFunc.existingFolderError', 'A folder with the name \'{0}\' already exists.', name);
        } else if (!functionNameRegex.test(name)) {
            return localize('azFunc.functionNameInvalidError', 'Function name must start with a letter and can contain letters, digits, \'_\' and \'-\'');
        } else {
            return undefined;
        }
    }
}
