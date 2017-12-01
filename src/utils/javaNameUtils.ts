/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';

const keywords: string[] = [
    'abstract', 'continue', 'for', 'new', 'switch',
    'assert', 'default', 'if', 'package', 'synchronized',
    'boolean', 'do', 'goto', 'private', 'this',
    'break', 'double', 'implements', 'protected', 'throw',
    'byte', 'else', 'import', 'public', 'throws',
    'case', 'enum', 'instanceof', 'return', 'transient',
    'catch', 'extends', 'int', 'short', 'try',
    'char', 'final', 'interface', 'static', 'void',
    'class', 'finally', 'long', 'strictfp', 'volatile',
    'const', 'float', 'native', 'super', 'while',
    'null', 'true', 'false'
];

const identifierRegex: RegExp = /^[a-zA-Z_$][a-zA-Z\d_$]*$/;
const mavenCheckRegex: RegExp = /^[a-zA-Z\d_\-\.]+$/;
const javaFunctionRegex: RegExp = /^[a-zA-Z][a-zA-Z\d_]*$/;

function isKeyword(name: string): boolean {
    return keywords.indexOf(name) > -1;
}

function isIdentifier(name: string): boolean {
    return identifierRegex.test(name);
}

function validateJavaName(name: string): string | undefined {
    if (isKeyword(name)) {
        return localize('azFunc.JavaNameIsKeywordError', '\'{0}\' is a reserved keyword.', name);
    }
    if (!isIdentifier(name)) {
        return localize('azFunc.JavaNameNotIdentifierError', '\'{0}\' is invalid, only allow letters, digits, \'_\', and \'$\', not begin with digit.', name);
    }
    return undefined;
}

function isValidMavenIdentifier(name: string): boolean {
    return mavenCheckRegex.test(name);

}

export function getJavaClassName(name: string): string {
    return `${name[0].toUpperCase()}${name.slice(1)}`;
}

export function validateJavaFunctionName(name: string): string | undefined {
    if (isKeyword(name)) {
        return localize('azFunc.JavaNameIsKeywordError', '\'{0}\' is a reserved keyword.', name);
    }
    if (!javaFunctionRegex.test(name)) {
        return localize('azFunc.functionNameInvalidError', 'Java Function name must start with a letter and can contain letters, digits and \'_\'');
    }
    return undefined;
}

export function validateMavenIdentifier(input: string): string | undefined {
    if (!input) {
        return localize('azFunc.inputEmptyError', 'The input cannot be empty.');
    }
    if (!isValidMavenIdentifier(input)) {
        return localize('azFunc.invalidMavenIdentifierError', 'Only allow letters, digits, \'_\', \'-\' and \'.\'');
    }
    return undefined;
}

export function validatePackageName(packageName: string): string | undefined {
    if (!packageName) {
        return localize('azFunc.emptyPackageNameError', 'The package name cannot be empty.');
    }
    for (const s of packageName.split('.')) {
        const checkResult: string | undefined = validateJavaName(s);
        if (checkResult) {
            return checkResult;
        }
    }
    return undefined;
}
