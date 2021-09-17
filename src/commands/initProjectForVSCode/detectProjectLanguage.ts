/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { buildGradleFileName, localSettingsFileName, pomXmlFileName, ProjectLanguage, workerRuntimeKey } from '../../constants';
import { getLocalSettingsJson, ILocalSettingsJson } from '../../funcConfig/local.settings';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { telemetryUtils } from '../../utils/telemetryUtils';
import { findFiles } from '../../utils/workspace';
import { getScriptFileNameFromLanguage } from '../createFunction/scriptSteps/ScriptFunctionCreateStep';

/**
 * Returns the project language if we can uniquely detect it for this folder, otherwise returns undefined
 */
export async function detectProjectLanguage(context: IActionContext, projectPath: string): Promise<ProjectLanguage | undefined> {
    let detectedLangs: ProjectLanguage[] = await detectScriptLanguages(context, projectPath);

    if (await isJavaProject(projectPath)) {
        detectedLangs.push(ProjectLanguage.Java);
    }

    if (await isCSharpProject(context, projectPath)) {
        detectedLangs.push(ProjectLanguage.CSharp);
    }

    if (await isFSharpProject(context, projectPath)) {
        detectedLangs.push(ProjectLanguage.FSharp);
    }

    await detectLanguageFromLocalSettings(context, detectedLangs, projectPath);

    // de-dupe
    detectedLangs = detectedLangs.filter((pl, index) => detectedLangs.indexOf(pl) === index);
    return detectedLangs.length === 1 ? detectedLangs[0] : undefined;
}

async function isJavaProject(projectPath: string): Promise<boolean> {
    return await isMavenProject(projectPath) || await isGradleProject(projectPath)
}

export async function isMavenProject(projectPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(projectPath, pomXmlFileName));
}

export async function isGradleProject(projectPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(projectPath, buildGradleFileName));
}

async function isCSharpProject(context: IActionContext, projectPath: string): Promise<boolean> {
    return (await dotnetUtils.getProjFiles(context, ProjectLanguage.CSharp, projectPath)).length === 1;
}

async function isFSharpProject(context: IActionContext, projectPath: string): Promise<boolean> {
    return (await dotnetUtils.getProjFiles(context, ProjectLanguage.FSharp, projectPath)).length === 1;
}

/**
 * If the user has a "local.settings.json" file, we may be able to infer the langauge from the setting "FUNCTIONS_WORKER_RUNTIME"
 */
async function detectLanguageFromLocalSettings(context: IActionContext, detectedLangs: ProjectLanguage[], projectPath: string): Promise<void> {
    try {
        const settings: ILocalSettingsJson = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
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
async function detectScriptLanguages(context: IActionContext, projectPath: string): Promise<ProjectLanguage[]> {
    return await telemetryUtils.runWithDurationTelemetry(context, 'detectScriptLangs', async () => {
        const detectedLangs: ProjectLanguage[] = [];
        for (const language of Object.values(ProjectLanguage)) {
            const functionFileName: string | undefined = getScriptFileNameFromLanguage(language);
            if (functionFileName) {
                const uris = await findFiles(projectPath, `*/${functionFileName}`);
                if (uris.length > 0) {
                    detectedLangs.push(language);
                }
            }
        }

        return detectedLangs;
    });
}
