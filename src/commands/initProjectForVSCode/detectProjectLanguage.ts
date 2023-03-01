/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage, buildGradleFileName, localSettingsFileName, packageJsonFileName, pomXmlFileName, previewPythonModel, pythonFunctionAppFileName, workerRuntimeKey } from '../../constants';
import { ILocalSettingsJson, getLocalSettingsJson } from '../../funcConfig/local.settings';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { hasNodeJsDependency, tryGetPackageJson } from '../../utils/nodeJsUtils';
import { telemetryUtils } from '../../utils/telemetryUtils';
import { findFiles } from '../../utils/workspace';
import { getScriptFileNameFromLanguage } from '../createFunction/scriptSteps/ScriptFunctionCreateStep';

/**
 * Returns the project language if we can uniquely detect it for this folder, otherwise returns undefined
 */
export async function detectProjectLanguage(context: IActionContext, projectPath: string): Promise<ProjectLanguage | undefined> {
    try {
        let detectedLangs: ProjectLanguage[] = await detectScriptLanguages(context, projectPath);
        if (await isNodeJsProject(projectPath)) {
            if (await isTypeScriptProject(projectPath)) {
                detectedLangs.push(ProjectLanguage.TypeScript);
            } else {
                if (!detectedLangs.includes(ProjectLanguage.TypeScript)) {
                    detectedLangs.push(ProjectLanguage.JavaScript);
                }
            }
        }

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
        console.log('detected langs end', detectedLangs);
        return detectedLangs.length === 1 ? detectedLangs[0] : undefined;
    } catch {
        return undefined;
    }
}

async function isJavaProject(projectPath: string): Promise<boolean> {
    return await isMavenProject(projectPath) || await isGradleProject(projectPath)
}

export async function isMavenProject(projectPath: string): Promise<boolean> {
    return await AzExtFsExtra.pathExists(path.join(projectPath, pomXmlFileName));
}

export async function isGradleProject(projectPath: string): Promise<boolean> {
    return await AzExtFsExtra.pathExists(path.join(projectPath, buildGradleFileName));
}

async function isCSharpProject(context: IActionContext, projectPath: string): Promise<boolean> {
    return (await dotnetUtils.getProjFiles(context, ProjectLanguage.CSharp, projectPath)).length === 1;
}

async function isFSharpProject(context: IActionContext, projectPath: string): Promise<boolean> {
    return (await dotnetUtils.getProjFiles(context, ProjectLanguage.FSharp, projectPath)).length === 1;
}

async function isNodeJsProject(projectPath: string): Promise<boolean> {
    return await AzExtFsExtra.pathExists(path.join(projectPath, packageJsonFileName));
}

async function isTypeScriptProject(projectPath: string): Promise<boolean> {
    return await hasNodeJsDependency(projectPath, 'typescript', true);
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

export async function detectProjectLanguageModel(language: ProjectLanguage | undefined, projectPath: string): Promise<number | undefined> {
    try {
        switch (language) {
            case ProjectLanguage.Python:
                const uris = await findFiles(projectPath, pythonFunctionAppFileName);

                if (uris.length > 0) {
                    return previewPythonModel;
                }

                break;
            case ProjectLanguage.JavaScript:
            case ProjectLanguage.TypeScript:
                const packageJson = await tryGetPackageJson(projectPath);
                const funcDepVersion = packageJson?.dependencies?.['@azure/functions'];
                if (funcDepVersion) {
                    const supportedModels = [3, 4];
                    for (const model of supportedModels) {
                        if (new RegExp(`^[^0-9]*${model}`).test(funcDepVersion)) {
                            return model;
                        }
                    }
                }

                break;
            default:
                break;
        }
    } catch {
        // ignore
    }

    return undefined;
}
