/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IAzureUserInput } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../constants';
import { IFunctionJson } from '../../FunctionConfig';
import { localize } from "../../localize";
import { IScriptFunctionTemplate } from '../../templates/parseScriptTemplates';
import * as fsUtil from '../../utils/fs';
import { FunctionCreatorBase } from './FunctionCreatorBase';

export function getScriptFileNameFromLanguage(language: string): string | undefined {
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
            return '__init__.py';
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
    protected _template: IScriptFunctionTemplate;
    protected _functionName: string;
    private _language: string;

    constructor(functionAppPath: string, template: IScriptFunctionTemplate, language: string) {
        super(functionAppPath, template);
        this._language = language;
    }

    public async promptForSettings(ui: IAzureUserInput, functionName: string | undefined): Promise<void> {
        if (!functionName) {
            const defaultFunctionName: string | undefined = await fsUtil.getUniqueFsPath(this._functionAppPath, this._template.defaultFunctionName);
            this._functionName = await ui.showInputBox({
                placeHolder: localize('azFunc.funcNamePlaceholder', 'Function name'),
                prompt: localize('azFunc.funcNamePrompt', 'Provide a function name'),
                validateInput: (s: string): string | undefined => this.validateTemplateName(s),
                value: defaultFunctionName || this._template.defaultFunctionName
            });
        } else {
            this._functionName = functionName;
        }
    }

    public async createFunction(userSettings: { [propertyName: string]: string }): Promise<string | undefined> {
        const functionPath: string = path.join(this._functionAppPath, this._functionName);
        await fse.ensureDir(functionPath);
        await Promise.all(Object.keys(this._template.templateFiles).map(async (fileName: string) => {
            await fse.writeFile(path.join(functionPath, fileName), this._template.templateFiles[fileName]);
        }));

        for (const key of Object.keys(userSettings)) {
            this._template.functionConfig.inBinding[key] = userSettings[key];
        }

        const functionJson: IFunctionJson = this._template.functionConfig.functionJson;
        if (this.editFunctionJson) {
            await this.editFunctionJson(functionJson);
        }

        await fsUtil.writeFormattedJson(path.join(functionPath, 'function.json'), functionJson);

        const mainFileName: string | undefined = getScriptFileNameFromLanguage(this._language);
        if (mainFileName) {
            return path.join(functionPath, mainFileName);
        } else {
            return undefined;
        }
    }

    protected editFunctionJson?(functionJson: IFunctionJson): Promise<void>;

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
