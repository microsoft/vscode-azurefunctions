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
    const detectedLangs: ProjectLanguage[] = await detectScriptLanguages(functionAppPath);

    if (await isJavaProject(functionAppPath)) {
        detectedLangs.push(ProjectLanguage.Java);
    }

    if (await isCSharpProject(functionAppPath)) {
        detectedLangs.push(ProjectLanguage.CSharp);
    }

    if (await isFSharpProject(functionAppPath)) {
        detectedLangs.push(ProjectLanguage.FSharp);
    }

    return detectedLangs.length === 1 ? detectedLangs[0] : undefined;
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
async function detectScriptLanguages(functionAppPath: string): Promise<ProjectLanguage[]> {
    const subDirs: string[] = [];
    const subpaths: string[] = await fse.readdir(functionAppPath);
    for (const subpath of subpaths) {
        const fullPath: string = path.join(functionAppPath, subpath);
        const stats: fse.Stats = await fse.lstat(fullPath);
        if (stats.isDirectory()) {
            subDirs.push(fullPath);
        }
    }

    const detectedLangs: ProjectLanguage[] = [];
    for (const key of Object.keys(ProjectLanguage)) {
        const language: ProjectLanguage = <ProjectLanguage>ProjectLanguage[key];
        const functionFileName: string | undefined = getScriptFileNameFromLanguage(language);
        if (functionFileName) {
            for (const subDir of subDirs) {
                if (await fse.pathExists(path.join(subDir, functionFileName))) {
                    detectedLangs.push(language);
                    break;
                }
            }
        }
    }

    return detectedLangs;
}
