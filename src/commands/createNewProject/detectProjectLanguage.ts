/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage } from '../../constants';
import { getScriptFileNameFromLanguage } from '../createFunction/ScriptFunctionCreator';
import { tryGetCsprojFile, tryGetFsprojFile } from './DotnetProjectCreator';

/**
 * Returns the project language if we can uniquely detect it for this folder, otherwise returns undefined
 */
export async function detectProjectLanguage(functionAppPath: string): Promise<ProjectLanguage | undefined> {
    const detectedLangs: Set<ProjectLanguage> = await detectScriptLanguages(functionAppPath);

    if (await isJavaProject(functionAppPath)) {
        detectedLangs.add(ProjectLanguage.Java);
    }

    if (await isCSharpProject(functionAppPath)) {
        detectedLangs.add(ProjectLanguage.CSharp);
    }

    if (await isFSharpProject(functionAppPath)) {
        detectedLangs.add(ProjectLanguage.FSharp);
    }

    return detectedLangs.size === 1 ? detectedLangs.values().next().value : undefined;
}

async function isJavaProject(functionAppPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(functionAppPath, 'pom.xml'));
}

async function isCSharpProject(functionAppPath: string): Promise<boolean> {
    return !!await tryGetCsprojFile(functionAppPath);
}

async function isFSharpProject(functionAppPath: string): Promise<boolean> {
    return !!await tryGetFsprojFile(functionAppPath);
}

/**
 * Script projects will always be in the following structure: <Root project dir>/<function dir>/<function script file>
 * To detect the language, we can check for any "function script file" that matches the well-known filename for each language
 */
async function detectScriptLanguages(functionAppPath: string): Promise<Set<ProjectLanguage>> {
    const detectedLangs: Set<ProjectLanguage> = new Set();
    const functionDirs: string[] = await fse.readdir(functionAppPath);
    for (const functionDir of functionDirs) {
        const functionDirPath: string = path.join(functionAppPath, functionDir);
        const stats: fse.Stats = await fse.lstat(functionDirPath);
        if (stats.isDirectory()) {
            for (const key of Object.keys(ProjectLanguage)) {
                const language: ProjectLanguage = <ProjectLanguage>ProjectLanguage[key];
                const functionFileName: string | undefined = getScriptFileNameFromLanguage(language);
                if (functionFileName && await fse.pathExists(path.join(functionDirPath, functionFileName))) {
                    detectedLangs.add(language);
                }
            }
        }
    }

    return detectedLangs;
}
