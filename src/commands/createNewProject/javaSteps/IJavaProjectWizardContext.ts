/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { JavaBuildTool } from '../../../constants';
import { localize } from "../../../localize";
import { IProjectWizardContext } from "../IProjectWizardContext";

export interface IJavaProjectWizardContext extends IProjectWizardContext {
    javaVersion?: string;
    javaGroupId?: string;
    javaArtifactId?: string;
    javaProjectVersion?: string;
    javaPackageName?: string;
    javaAppName?: string;
    buildTool?: JavaBuildTool;
}

export function getJavaClassName(name: string): string {
    name = name.replace('-', '_');
    return name[0].toUpperCase() + name.slice(1);
}

export function getJavaPackagePath(projectPath: string, packageName: string): string {
    return path.join(projectPath, 'src', 'main', 'java', ...packageName.split('.'));
}

export function getJavaFunctionFilePath(projectPath: string, packageName: string, functionName: string): string {
    return path.join(getJavaPackagePath(projectPath, packageName), getJavaClassName(functionName) + '.java');
}

export function validateMavenIdentifier(input: string): string | undefined {
    if (!input) {
        return localize('inputEmptyError', 'The input cannot be empty.');
    } else if (!/^[a-z\d_\-\.]+$/i.test(input)) {
        return localize('invalidMavenIdentifierError', 'Id can only contain letters, digits, "_", "-" and ".".');
    } else {
        return undefined;
    }
}
