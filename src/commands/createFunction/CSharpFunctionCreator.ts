/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { OutputChannel } from "vscode";
import { IUserInterface } from "../../IUserInterface";
import { localize } from "../../localize";
import { Template } from "../../templates/Template";
import { removeLanguageFromId } from "../../templates/TemplateData";
import { cpUtils } from "../../utils/cpUtils";
import { dotnetUtils } from '../../utils/dotnetUtils';
import * as fsUtil from '../../utils/fs';
import { FunctionCreatorBase } from './FunctionCreatorBase';

export class CSharpFunctionCreator extends FunctionCreatorBase {
    private _outputChannel: OutputChannel;
    private _functionName: string;

    constructor(functionAppPath: string, template: Template, outputChannel: OutputChannel) {
        super(functionAppPath, template);
        this._outputChannel = outputChannel;
    }

    public async promptForSettings(ui: IUserInterface, functionName: string | undefined): Promise<void> {
        if (!functionName) {
            const defaultFunctionName: string | undefined = await fsUtil.getUniqueFsPath(this._functionAppPath, removeLanguageFromId(this._template.id), '.cs');
            const placeHolder: string = localize('azFunc.funcNamePlaceholder', 'Function name');
            const prompt: string = localize('azFunc.funcNamePrompt', 'Provide a function name');
            this._functionName = await ui.showInputBox(placeHolder, prompt, (s: string) => this.validateTemplateName(s), defaultFunctionName || this._template.defaultFunctionName);
        } else {
            this._functionName = functionName;
        }
    }

    public async createFunction(userSettings: { [propertyName: string]: string }): Promise<string | undefined> {
        await dotnetUtils.validateTemplatesInstalled(this._outputChannel, this._functionAppPath);

        const args: string[] = [];
        for (const key of Object.keys(userSettings)) {
            let parameter: string = key.charAt(0).toUpperCase() + key.slice(1);
            // the parameters for dotnet templates are not consistent. Hence, we have to special-case a few of them:
            if (parameter === 'AuthLevel') {
                parameter = 'AccessRights';
            } else if (parameter === 'QueueName') {
                parameter = 'Path';
            }

            args.push(`--${parameter}="${userSettings[key]}"`);
        }

        await cpUtils.executeCommand(
            this._outputChannel,
            this._functionAppPath,
            'dotnet',
            'new',
            removeLanguageFromId(this._template.id),
            `--name="${this._functionName}"`,
            ...args
        );

        return path.join(this._functionAppPath, `${this._functionName}.cs`);
    }

    private validateTemplateName(name: string | undefined): string | undefined {
        if (!name) {
            return localize('azFunc.emptyTemplateNameError', 'The template name cannot be empty.');
        } else if (fse.existsSync(path.join(this._functionAppPath, `${name}.cs`))) {
            return localize('azFunc.existingCSFile', 'A CSharp file with the name \'{0}\' already exists.', name);
        } else if (!this._functionNameRegex.test(name)) {
            return localize('azFunc.functionNameInvalidError', 'Function name must start with a letter and can contain letters, digits, \'_\' and \'-\'');
        } else {
            return undefined;
        }
    }
}
