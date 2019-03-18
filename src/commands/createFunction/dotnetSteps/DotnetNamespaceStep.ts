/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from 'vscode-azureextensionui';
// tslint:disable-next-line:no-require-imports
import XRegExp = require('xregexp');
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { IDotnetFunctionWizardContext } from './IDotnetFunctionWizardContext';

export class DotnetNamespaceStep extends AzureWizardPromptStep<IDotnetFunctionWizardContext> {
    public async prompt(wizardContext: IDotnetFunctionWizardContext): Promise<void> {
        wizardContext.namespace = await ext.ui.showInputBox({
            placeHolder: localize('namespacePlaceHolder', 'Namespace'),
            prompt: localize('namespacePrompt', 'Provide a namespace'),
            validateInput: validateCSharpNamespace,
            value: 'Company.Function'
        });
    }

    public shouldPrompt(wizardContext: IDotnetFunctionWizardContext): boolean {
        return !wizardContext.namespace;
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
        return localize('cSharpEmptyTemplateNameError', 'The template name cannot be empty.');
    }

    // Namespace specification: https://github.com/dotnet/csharplang/blob/master/spec/namespaces.md#namespace-declarations
    const identifiers: string[] = value.split('.');
    for (const identifier of identifiers) {
        if (identifier === '') {
            return localize('cSharpExtraPeriod', 'Leading or trailing "." character is not allowed.');
        } else if (!identifierRegex.test(identifier)) {
            return localize('cSharpInvalidCharacters', 'The identifier "{0}" contains invalid characters.', identifier);
        } else if (keywords.find((s: string) => s === identifier.toLowerCase()) !== undefined) {
            return localize('cSharpKeywordWarning', 'The identifier "{0}" is a reserved keyword.', identifier);
        }
    }

    return undefined;
}
