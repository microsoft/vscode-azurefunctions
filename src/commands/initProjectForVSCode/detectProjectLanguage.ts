/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage } from '../../constants';
import { getScriptFileNameFromLanguage } from '../createFunction/scriptSteps/ScriptFunctionCreateStep';
import { tryGetCsprojFile, tryGetFsprojFile } from './InitVSCodeStep/DotnetInitVSCodeStep';

/**
 * Returns the project language if we can uniquely detect it for this folder, otherwise returns undefined
 */
export async function detectProjectLanguage(projectPath: string): Promise<ProjectLanguage | undefined> {
    const detectedLangs: ProjectLanguage[] = await detectScriptLanguages(projectPath);

    if (await isJavaProject(projectPath)) {
        detectedLangs.push(ProjectLanguage.Java);
    }

    if (await isCSharpProject(projectPath)) {
        detectedLangs.push(ProjectLanguage.CSharp);
    }

    if (await isFSharpProject(projectPath)) {
        detectedLangs.push(ProjectLanguage.FSharp);
    }

    return detectedLangs.length === 1 ? detectedLangs[0] : undefined;
}

async function isJavaProject(projectPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(projectPath, 'pom.xml'));
}

async function isCSharpProject(projectPath: string): Promise<boolean> {
    return !!await tryGetCsprojFile(projectPath);
}

async function isFSharpProject(projectPath: string): Promise<boolean> {
    return !!await tryGetFsprojFile(projectPath);
}

/**
 * Script projects will always be in the following structure: <Root project dir>/<function dir>/<function script file>
 * To detect the language, we can check for any "function script file" that matches the well-known filename for each language
 */
async function detectScriptLanguages(projectPath: string): Promise<ProjectLanguage[]> {
    const subDirs: string[] = [];
    const subpaths: string[] = await fse.readdir(projectPath);
    for (const subpath of subpaths) {
        const fullPath: string = path.join(projectPath, subpath);
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
