/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { OutputChannel } from "vscode";
import { IUserInterface } from "../../IUserInterface";
import { localize } from "../../localize";
import { Template } from "../../templates/Template";
import { convertTemplateIdToJava } from "../../templates/TemplateData";
import { cpUtils } from "../../utils/cpUtils";
import * as fsUtil from '../../utils/fs';
import { getJavaClassName, validateJavaFunctionName, validatePackageName } from "../../utils/javaNameUtils";
import { mavenUtils } from "../../utils/mavenUtils";
import { IFunctionCreator } from './IFunctionCreator';

function getNewJavaFunctionFilePath(functionAppPath: string, packageName: string, functionName: string): string {
    return path.join(functionAppPath, 'src', 'main', 'java', ...packageName.split('.'), `${getJavaClassName(functionName)}.java`);
}

export class JavaFunctionCreator implements IFunctionCreator {
    private _outputChannel: OutputChannel;
    private _packageName: string;
    private _functionName: string;

    constructor(outputChannel: OutputChannel) {
        this._outputChannel = outputChannel;
    }

    public async promptForSettings(functionAppPath: string, template: Template, ui: IUserInterface): Promise<void> {
        const packagePlaceHolder: string = localize('azFunc.java.packagePlaceHolder', 'Package');
        const packagePrompt: string = localize('azFunc.java.packagePrompt', 'Provide a package name');
        this._packageName = await ui.showInputBox(packagePlaceHolder, packagePrompt, false, validatePackageName, 'com.function');

        const defaultFunctionName: string | undefined = await fsUtil.getUniqueJavaFsPath(functionAppPath, this._packageName, `${convertTemplateIdToJava(template.id)}Java`);
        const placeHolder: string = localize('azFunc.funcNamePlaceholder', 'Function name');
        const prompt: string = localize('azFunc.funcNamePrompt', 'Provide a function name');
        this._functionName = await ui.showInputBox(placeHolder, prompt, false, (s: string) => this.validateTemplateName(s), defaultFunctionName || template.defaultFunctionName);
    }

    public async createFunction(functionAppPath: string, template: Template, userSettings: { [propertyName: string]: string }): Promise<string | undefined> {
        const javaFuntionProperties: string[] = [];
        for (const key of Object.keys(userSettings)) {
            javaFuntionProperties.push(`"-D${key}=${userSettings[key]}"`);
        }

        await mavenUtils.validateMavenInstalled(functionAppPath);
        this._outputChannel.show();
        await cpUtils.executeCommand(
            this._outputChannel,
            functionAppPath,
            'mvn',
            'azure-functions:add',
            '-B',
            `"-Dfunctions.package=${this._packageName}"`,
            `"-Dfunctions.name=${this._functionName}"`,
            `"-Dfunctions.template=${convertTemplateIdToJava(template.id)}"`,
            ...javaFuntionProperties
        );

        return getNewJavaFunctionFilePath(functionAppPath, this._packageName, this._functionName);
    }

    private validateTemplateName(name: string | undefined): string | undefined {
        if (!name) {
            return localize('azFunc.emptyTemplateNameError', 'The template name cannot be empty.');
        } else {
            return validateJavaFunctionName(name);
        }
    }
}
