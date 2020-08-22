/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { localSettingsFileName, pomXmlFileName, ProjectLanguage, workerRuntimeKey } from '../../constants';
import { getLocalSettingsJson, ILocalSettingsJson } from '../../funcConfig/local.settings';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { getScriptFileNameFromLanguage } from '../createFunction/scriptSteps/ScriptFunctionCreateStep';

/**
 * Returns the project language if we can uniquely detect it for this folder, otherwise returns undefined
 */
export async function detectProjectLanguage(projectPath: string): Promise<ProjectLanguage | undefined> {
    let detectedLangs: ProjectLanguage[] = await detectScriptLanguages(projectPath);

    if (await isJavaProject(projectPath)) {
        detectedLangs.push(ProjectLanguage.Java);
    }

    if (await isCSharpProject(projectPath)) {
        detectedLangs.push(ProjectLanguage.CSharp);
    }

    if (await isFSharpProject(projectPath)) {
        detectedLangs.push(ProjectLanguage.FSharp);
    }

    await detectLanguageFromLocalSettings(detectedLangs, projectPath);

    // de-dupe
    detectedLangs = detectedLangs.filter((pl, index) => detectedLangs.indexOf(pl) === index);
    return detectedLangs.length === 1 ? detectedLangs[0] : undefined;
}

async function isJavaProject(projectPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(projectPath, pomXmlFileName));
}

async function isCSharpProject(projectPath: string): Promise<boolean> {
    return (await dotnetUtils.getProjFiles(ProjectLanguage.CSharp, projectPath)).length === 1;
}

async function isFSharpProject(projectPath: string): Promise<boolean> {
    return (await dotnetUtils.getProjFiles(ProjectLanguage.FSharp, projectPath)).length === 1;
}

/**
 * If the user has a "local.settings.json" file, we may be able to infer the langauge from the setting "FUNCTIONS_WORKER_RUNTIME"
 */
async function detectLanguageFromLocalSettings(detectedLangs: ProjectLanguage[], projectPath: string): Promise<void> {
    try {
        const settings: ILocalSettingsJson = await getLocalSettingsJson(path.join(projectPath, localSettingsFileName));
        switch (settings.Values?.[workerRuntimeKey]?.toLowerCase()) {
            case 'java':
                detectedLangs.push(ProjectLanguage.Java);
                break;
            case 'python':
                detectedLangs.push(ProjectLanguage.Python);
                break;
            case 'powershell':
                detectedLangs.push(ProjectLanguage.PowerShell);
                break;
            case 'custom':
                detectedLangs.push(ProjectLanguage.Custom);
                break;
            default:
            // setting doesn't exist or it could be multiple different languages (aka "node" could by JavaScript or TypeScript)
        }
    } catch {
        // ignore
    }
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
    for (const language of Object.values(ProjectLanguage)) {
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
