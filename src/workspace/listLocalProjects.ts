/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from "vscode";
import { tryParseFuncVersion, type FuncVersion } from "../FuncVersion";
import { tryGetFunctionProjectRoot } from "../commands/createNewProject/verifyIsProject";
import { getFunctionAppName, getJavaDebugSubpath } from "../commands/initProjectForVSCode/InitVSCodeStep/JavaInitVSCodeStep";
import { ProjectLanguage, funcVersionSetting, javaBuildTool, projectLanguageModelSetting, projectLanguageSetting, type JavaBuildTool } from "../constants";
import { localize } from "../localize";
import { type IProjectTreeItem } from "../tree/IProjectTreeItem";
import { dotnetUtils } from "../utils/dotnetUtils";
import { getWorkspaceSetting } from "../vsCodeConfig/settings";
import { type ListLocalProjectsResult } from "../vscode-azurefunctions.api";
import { LocalProject } from "./LocalProject";
import path = require("path");

export type LocalProjectOptionsInternal = {
    effectiveProjectPath: string;
    folder: vscode.WorkspaceFolder;
    version: FuncVersion;
    language: ProjectLanguage;
    languageModel?: number;
    preCompiledProjectPath?: string
    isIsolated?: boolean;
}

export type LocalProjectInternal = { options: LocalProjectOptionsInternal } & IProjectTreeItem;

export async function listLocalProjects(): Promise<ListLocalProjectsResult> {
    const result = await callWithTelemetryAndErrorHandling('listLocalProjects', async (context) => {
        context.errorHandling.rethrow = true;
        const result: ListLocalProjectsResult = {
            initializedProjects: [],
            unintializedProjects: [],
            invalidProjects: [],
        };
        const workspaceFolders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders || [];
        for (const workspaceFolder of workspaceFolders) {
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, workspaceFolder);
            if (projectPath) {
                try {
                    const language: ProjectLanguage | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
                    const languageModel: number | undefined = getWorkspaceSetting(projectLanguageModelSetting, projectPath);
                    const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, projectPath));
                    if (language === undefined || version === undefined) {
                        result.unintializedProjects.push({
                            workspaceFolder,
                            projectPath,
                        });
                    } else {
                        let preCompiledProjectPath: string | undefined;
                        let effectiveProjectPath: string;
                        let isIsolated: boolean | undefined;
                        const compiledProjectInfo: CompiledProjectInfo | undefined = await getCompiledProjectInfo(context, projectPath, language);
                        if (compiledProjectInfo) {
                            preCompiledProjectPath = projectPath;
                            effectiveProjectPath = compiledProjectInfo.compiledProjectPath;
                            isIsolated = compiledProjectInfo.isIsolated;
                        } else {
                            effectiveProjectPath = projectPath;
                        }
                        result.initializedProjects.push(new LocalProject({
                            effectiveProjectPath,
                            folder: workspaceFolder,
                            language,
                            languageModel,
                            version,
                            preCompiledProjectPath,
                            isIsolated,
                        }));
                    }
                } catch (error: unknown) {
                    result.invalidProjects.push({
                        error,
                        projectPath,
                        workspaceFolder
                    })
                }
            }
        }

        return result;
    });

    // Result is non-null because we are rethrowing errors above
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return result!
}

type CompiledProjectInfo = { compiledProjectPath: string; isIsolated: boolean };

async function getCompiledProjectInfo(context: IActionContext, projectPath: string, projectLanguage: ProjectLanguage): Promise<CompiledProjectInfo | undefined> {
    if (projectLanguage === ProjectLanguage.CSharp || projectLanguage === ProjectLanguage.FSharp) {
        const projFiles: dotnetUtils.ProjectFile[] = await dotnetUtils.getProjFiles(context, projectLanguage, projectPath);
        if (projFiles.length === 1) {
            const targetFramework: string = await dotnetUtils.getTargetFramework(projFiles[0]);
            const isIsolated = await dotnetUtils.getIsIsolated(projFiles[0]);
            return { compiledProjectPath: path.join(projectPath, dotnetUtils.getDotnetDebugSubpath(targetFramework)), isIsolated };
        } else {
            throw new Error(localize('unableToFindProj', 'Unable to detect project file.'));
        }
    } else if (projectLanguage === ProjectLanguage.Java) {
        const buildTool: JavaBuildTool | undefined = getWorkspaceSetting(javaBuildTool, projectPath);
        const functionAppName: string | undefined = await getFunctionAppName(projectPath, buildTool);
        if (!functionAppName) {
            throw new Error(localize('unableToGetFunctionAppName', 'Unable to detect property "functionAppName" in pom.xml.'));
        } else {
            return { compiledProjectPath: path.join(projectPath, getJavaDebugSubpath(functionAppName, buildTool)), isIsolated: false };
        }
    } else if (projectLanguage === ProjectLanguage.Ballerina) {
        return { compiledProjectPath: path.join(projectPath, "target", "azure_functions"), isIsolated: false };
    } else {
        return undefined;
    }
}
