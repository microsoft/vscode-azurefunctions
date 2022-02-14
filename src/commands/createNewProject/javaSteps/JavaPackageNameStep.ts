/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { InputBoxOptions } from "vscode";
import { localize } from "../../../localize";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";

export class JavaPackageNameStep extends AzureWizardPromptStep<IJavaProjectWizardContext> {
    public async prompt(context: IJavaProjectWizardContext): Promise<void> {
        const options: InputBoxOptions = {
            placeHolder: localize('packagePlaceHolder', 'Package name'),
            prompt: localize('packagePrompt', 'Provide a package name'),
            validateInput: validatePackageName,
            value: context.javaGroupId || 'com.function'
        };
        context.javaPackageName = await context.ui.showInputBox(options);
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.javaPackageName;
    }
}

function validatePackageName(packageName: string): string | undefined {
    if (!packageName) {
        return localize('emptyPackageNameError', 'The package name cannot be empty.');
    }
    for (const s of packageName.split('.')) {
        const result: string | undefined = validateJavaName(s);
        if (result) {
            return result;
        }
    }
    return undefined;
}

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

function validateJavaName(name: string): string | undefined {
    if (keywords.find(k => k === name.toLowerCase())) {
        return localize('JavaNameIsKeywordError', '"{0}" is a reserved keyword.', name);
    } else if (!/^[a-z_$][a-z\d_$]*$/i.test(name)) {
        return localize('JavaNameNotIdentifierError', '"{0}" is invalid. It can only contain letters, digits, "_", and "$", and cannot begin with a digit.', name);
    } else {
        return undefined;
    }
}
