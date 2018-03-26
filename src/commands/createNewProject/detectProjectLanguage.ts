/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage } from '../../constants';
import { getScriptFileNameFromLanguage } from '../createFunction/ScriptFunctionCreator';
import { tryGetCsprojFile } from './CSharpProjectCreator';

/**
 * Returns the project language if we can uniquely detect it for this folder, otherwise returns undefined
 */
export async function detectProjectLanguage(functionAppPath: string): Promise<ProjectLanguage | undefined> {
    const isJava: boolean = await isJavaProject(functionAppPath);
    const isCSharp: boolean = await isCSharpProject(functionAppPath);
    const scriptProjectLanguage: ProjectLanguage | undefined = await getScriptLanguage(functionAppPath);

    if (scriptProjectLanguage !== undefined && !isJava && !isCSharp) {
        return scriptProjectLanguage;
    } else if (isJava && !isCSharp) {
        return ProjectLanguage.Java;
    } else if (isCSharp) {
        return ProjectLanguage.CSharp;
    } else {
        return undefined;
    }
}

async function isJavaProject(functionAppPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(functionAppPath, 'pom.xml'));
}

async function isCSharpProject(functionAppPath: string): Promise<boolean> {
    return await tryGetCsprojFile(functionAppPath) !== undefined;
}

/**
 * Script projects will always be in the following structure: <Root project dir>/<function dir>/<function script file>
 * To detect the language, we can check for any "function script file" that matches the well-known filename for each language
 */
async function getScriptLanguage(functionAppPath: string): Promise<ProjectLanguage | undefined> {
    let projectLanguage: ProjectLanguage | undefined;
    const functionDirs: string[] = await fse.readdir(functionAppPath);
    for (const functionDir of functionDirs) {
        const functionDirPath: string = path.join(functionAppPath, functionDir);
        const stats: fse.Stats = await fse.lstat(functionDirPath);
        if (stats.isDirectory()) {
            for (const key of Object.keys(ProjectLanguage)) {
                const language: ProjectLanguage = <ProjectLanguage>ProjectLanguage[key];
                const functionFileName: string | undefined = getScriptFileNameFromLanguage(language);
                if (functionFileName && await fse.pathExists(path.join(functionDirPath, functionFileName))) {
                    if (projectLanguage === undefined) {
                        projectLanguage = <ProjectLanguage>language;
                    } else if (projectLanguage !== language) {
                        return undefined;
                    }
                }
            }
        }
    }

    return projectLanguage;
}
