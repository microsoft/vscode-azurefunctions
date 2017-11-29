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

function isKeyword(name: string): boolean {
    return !!name && keywords.indexOf(name) > -1;
}

function isIdentifier(name: string): boolean {
    return !!name && identifierRegex.test(name);
}

function isValidPart(name: string): boolean {
    return isIdentifier(name) && !isKeyword(name);
}

function isValidName(name: string): boolean {
    if (!name) {
        return false;
    }
    for (const s of name.split('.')) {
        if (!isValidPart(s)) {
            return false;
        }
    }
    return true;
}

export function getJavaClassName(name: string): string {
    return `${name[0].toUpperCase()}${name.slice(1)}`;
}

export function validateFunctionName(name: string): string | undefined {
    if (!isValidPart(name)) {
        return localize('azFunc.invalidJavaFunctionNameError', 'The Java function name \'{0}\' is invalid.', name);
    }
    return undefined;
}

export function validatePackageName(packageName: string): string | undefined {
    if (!isValidName(packageName)) {
        return localize('azFunc.invalidPackageNameError', 'The package name \'{0}\' is invalid.', packageName);
    }
    return undefined;
}

export function validGroupIdName(groupId: string): string | undefined {
    if (!isValidName(groupId)) {
        return localize('azFunc.invalidGroupIdError', 'The Group ID \'{0}\' is invalid.', groupId);
    }
    return undefined;
}
