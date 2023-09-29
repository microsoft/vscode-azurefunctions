/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling } from "@microsoft/vscode-azext-utils";
import * as vscode from "vscode";
import { FuncVersion, tryParseFuncVersion } from "../FuncVersion";
import { CompiledProjectInfo, getCompiledProjectInfo } from "../LocalResourceProvider";
import { tryGetFunctionProjectRoot } from "../commands/createNewProject/verifyIsProject";
import { ProjectLanguage, funcVersionSetting, projectLanguageModelSetting, projectLanguageSetting } from "../constants";
import { IProjectTreeItem } from "../tree/IProjectTreeItem";
import { LocalProjectOptions } from "../tree/localProject/LocalProjectTreeItem";
import { getWorkspaceSetting } from "../vsCodeConfig/settings";
import { LocalProject } from "./LocalProject";

export type WorkspaceProject = { options: LocalProjectOptions } & IProjectTreeItem;

interface UnitializedLocalProject {
    workspaceFolder: vscode.WorkspaceFolder;
    projectPath: string;
}

interface InvalidLocalProject extends UnitializedLocalProject {
    error: unknown;
}

interface ListWorkspaceProjectsResult {
    projects: WorkspaceProject[];
    unintializedProjects: UnitializedLocalProject[];
    invalidProjects: InvalidLocalProject[];
}

export async function listLocalProjects(): Promise<ListWorkspaceProjectsResult> {
    const result = await callWithTelemetryAndErrorHandling('listLocalProjects', async (context) => {
        context.errorHandling.rethrow = true;
        const result: ListWorkspaceProjectsResult = {
            projects: [],
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
                        result.projects.push(new LocalProject({
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
