/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { OutputChannel } from "vscode";
import { IAzureUserInput } from 'vscode-azureextensionui';
// tslint:disable-next-line:no-require-imports
import XRegExp = require('xregexp');
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
    private _namespace: string;
    private _ui: IAzureUserInput;

    constructor(functionAppPath: string, template: Template, outputChannel: OutputChannel, ui: IAzureUserInput) {
        super(functionAppPath, template);
        this._outputChannel = outputChannel;
        this._ui = ui;
    }

    public async promptForSettings(ui: IAzureUserInput, functionName: string | undefined, functionSettings: { [key: string]: string | undefined; }): Promise<void> {
        if (!functionName) {
            const defaultFunctionName: string | undefined = await fsUtil.getUniqueFsPath(this._functionAppPath, removeLanguageFromId(this._template.id), '.cs');
            this._functionName = await ui.showInputBox({
                placeHolder: localize('azFunc.funcNamePlaceholder', 'Function name'),
                prompt: localize('azFunc.funcNamePrompt', 'Provide a function name'),
                validateInput: (s: string): string | undefined => this.validateTemplateName(s),
                value: defaultFunctionName || this._template.defaultFunctionName
            });
        } else {
            this._functionName = functionName;
        }

        if (functionSettings.namespace !== undefined) {
            this._namespace = <string>functionSettings.namespace;
        } else {
            this._namespace = await ui.showInputBox({
                placeHolder: localize('azFunc.namespacePlaceHolder', 'Namespace'),
                prompt: localize('azFunc.namespacePrompt', 'Provide a namespace'),
                validateInput: validateCSharpNamespace,
                value: 'Company.Function'
            });
        }
    }

    public async createFunction(userSettings: { [propertyName: string]: string }): Promise<string | undefined> {
        await dotnetUtils.validateTemplatesInstalled(this._outputChannel, this._ui);

        const args: string[] = [];
        for (const key of Object.keys(userSettings)) {
            let parameter: string = key.charAt(0).toUpperCase() + key.slice(1);
            // the parameters for dotnet templates are not consistent. Hence, we have to special-case a few of them:
            if (parameter.toLowerCase() === 'authlevel') {
                parameter = 'AccessRights';
            } else if (parameter.toLowerCase() === 'queuename') {
                parameter = 'Path';
            }

            // https://github.com/Microsoft/vscode-azurefunctions/issues/166
            const nameSuffix: string = '/{name}';
            if (userSettings[key].endsWith(nameSuffix)) {
                userSettings[key] = userSettings[key].slice(0, -1 * nameSuffix.length);
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
            `--namespace="${this._namespace}"`,
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

// Identifier specification: https://github.com/dotnet/csharplang/blob/master/spec/lexical-structure.md#identifiers
const formattingCharacter: string = '\\p{Cf}';
const connectingCharacter: string = '\\p{Pc}';
const decimalDigitCharacter: string = '\\p{Nd}';
const combiningCharacter: string = '\\p{Mn}|\\p{Mc}';
const letterCharacter: string = '\\p{Lu}|\\p{Ll}|\\p{Lt}|\\p{Lm}|\\p{Lo}|\\p{Nl}';
const identifierPartCharacter: string = `${letterCharacter}|${decimalDigitCharacter}|${connectingCharacter}|${combiningCharacter}|${formattingCharacter}`;
const identifierStartCharacter: string = `(${letterCharacter}|_)`;
const identifierOrKeyword: string = `${identifierStartCharacter}(${identifierPartCharacter})*`;
const identifierRegex: RegExp = XRegExp(`^${identifierOrKeyword}$`);
// Keywords: https://github.com/dotnet/csharplang/blob/master/spec/lexical-structure.md#keywords
const keywords: string[] = ['abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while'];

export function validateCSharpNamespace(value: string | undefined): string | undefined {
    if (!value) {
        return localize('azFunc.cSharpEmptyTemplateNameError', 'The template name cannot be empty.');
    }

    // Namespace specification: https://github.com/dotnet/csharplang/blob/master/spec/namespaces.md#namespace-declarations
    const identifiers: string[] = value.split('.');
    for (const identifier of identifiers) {
        if (identifier === '') {
            return localize('azFunc.cSharpExtraPeriod', 'Leading or trailing "." character is not allowed.');
        } else if (!identifierRegex.test(identifier)) {
            return localize('azFunc.cSharpInvalidCharacters', 'The identifier "{0}" contains invalid characters.', identifier);
        } else if (keywords.find((s: string) => s === identifier.toLowerCase()) !== undefined) {
            return localize('azFunc.cSharpKeywordWarning', 'The identifier "{0}" is a reserved keyword.', identifier);
        }
    }

    return undefined;
}
