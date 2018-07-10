/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { OutputChannel } from "vscode";
import { IAzureUserInput } from 'vscode-azureextensionui';
import { localize } from "../../localize";
import { Template } from "../../templates/Template";
import { removeLanguageFromId } from "../../templates/TemplateData";
import { cpUtils } from "../../utils/cpUtils";
import * as fsUtil from '../../utils/fs';
import { getFullClassName, parseJavaClassName, validatePackageName } from "../../utils/javaNameUtils";
import { mavenUtils } from "../../utils/mavenUtils";
import { FunctionCreatorBase } from './FunctionCreatorBase';

function getNewJavaFunctionFilePath(functionAppPath: string, packageName: string, functionName: string): string {
    return path.join(functionAppPath, 'src', 'main', 'java', ...packageName.split('.'), `${parseJavaClassName(functionName)}.java`);
}

export class JavaFunctionCreator extends FunctionCreatorBase {
    private _outputChannel: OutputChannel;
    private _packageName: string;
    private _functionName: string;

    constructor(functionAppPath: string, template: Template, outputChannel: OutputChannel) {
        super(functionAppPath, template);
        this._outputChannel = outputChannel;
    }

    public async promptForSettings(ui: IAzureUserInput, functionName: string | undefined): Promise<void> {
        this._packageName = await ui.showInputBox({
            placeHolder: localize('azFunc.java.packagePlaceHolder', 'Package'),
            prompt: localize('azFunc.java.packagePrompt', 'Provide a package name'),
            validateInput: validatePackageName,
            value: 'com.function'
        });

        if (!functionName) {
            const defaultFunctionName: string | undefined = await fsUtil.getUniqueJavaFsPath(this._functionAppPath, this._packageName, `${removeLanguageFromId(this._template.id)}Java`);
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
        const javaFuntionProperties: string[] = [];
        for (const key of Object.keys(userSettings)) {
            javaFuntionProperties.push(`"-D${key}=${userSettings[key]}"`);
        }

        await mavenUtils.validateMavenInstalled(this._functionAppPath);
        this._outputChannel.show();
        await mavenUtils.executeMvnCommand(
            this._outputChannel,
            this._functionAppPath,
            'azure-functions:add',
            '-B',
            `"-Dfunctions.package=${this._packageName}"`,
            `"-Dfunctions.name=${this._functionName}"`,
            `"-Dfunctions.template=${removeLanguageFromId(this._template.id)}"`,
            ...javaFuntionProperties
        );

        return getNewJavaFunctionFilePath(this._functionAppPath, this._packageName, this._functionName);
    }

    private validateTemplateName(name: string | undefined): string | undefined {
        if (!name) {
            return localize('azFunc.emptyTemplateNameError', 'The template name cannot be empty.');
        } else if (fse.existsSync(getNewJavaFunctionFilePath(this._functionAppPath, this._packageName, name))) {
            return localize('azFunc.existingFolderError', 'The Java class \'{0}\' already exists.', getFullClassName(this._packageName, name));
        } else if (!this._functionNameRegex.test(name)) {
            return localize('azFunc.functionNameInvalidError', 'Function name must start with a letter and can contain letters, digits, \'_\' and \'-\'');
        } else {
            return undefined;
        }
    }
}
