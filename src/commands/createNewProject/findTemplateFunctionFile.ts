/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage } from '../../constants';
import { findFiles } from '../../utils/workspace';

/**
 * Gallery templates can contain infrastructure, tests, and multiple nested Function Apps.
 * Look inside host.json projects for function entry points rather than arbitrary source files.
 */
export async function findTemplateFunctionFile(projectPath: string, language: string): Promise<string | undefined> {
    let pattern: string;
    let declaration: RegExp | undefined;
    switch (language) {
        case ProjectLanguage.CSharp:
        case 'CSharp':
            pattern = '**/*.cs';
            declaration = /\[\s*(?:[\w.]+\.)?Function(?:Name)?(?:Attribute)?\s*\(/;
            break;
        case ProjectLanguage.Java:
            pattern = 'src/main/java/**/*.java';
            declaration = /@(?:[\w.]+\.)?FunctionName\s*\(/;
            break;
        case ProjectLanguage.JavaScript:
        case ProjectLanguage.TypeScript:
            pattern = language === ProjectLanguage.TypeScript ? '**/*.ts' : '**/*.js';
            declaration = /\bapp\s*\.\s*(?:http|timer|storageBlob|storageQueue|serviceBusQueue|serviceBusTopic|eventHub|eventGrid|cosmosDB|generic|orchestration|activity|entity|mcpTool)\s*\(/;
            break;
        case ProjectLanguage.Python:
            pattern = '**/*.py';
            declaration = /@\w+\s*\.\s*(?:route|function_name|\w+_trigger)\s*\(/;
            break;
        case ProjectLanguage.PowerShell:
            pattern = '**/run.ps1';
            break;
        case ProjectLanguage.Go:
            pattern = '**/*.go';
            declaration = /\bfunc\s+main\s*\(/;
            break;
        default:
            return undefined;
    }

    const excludedDirectories = new Set(['bin', 'obj', 'target', 'dist', 'build', 'test', 'tests', 'venv', '.venv']);
    const isSourcePath = (filePath: string): boolean =>
        !path.relative(projectPath, filePath).split(path.sep).some(segment => excludedDirectories.has(segment.toLowerCase()));

    const hosts = (await findFiles(projectPath, '**/host.json')).filter(host => isSourcePath(host.fsPath));
    hosts.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
    for (const host of hosts) {
        const files = (await findFiles(path.dirname(host.fsPath), pattern)).filter(file => isSourcePath(file.fsPath));
        files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
        for (const file of files) {
            if (!declaration || declaration.test(await AzExtFsExtra.readFile(file.fsPath))) {
                return file.fsPath;
            }
        }
    }

    return undefined;
}
