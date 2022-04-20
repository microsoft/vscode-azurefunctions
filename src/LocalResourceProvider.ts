/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AzExtParentTreeItem, AzExtTreeItem, callWithTelemetryAndErrorHandling, IActionContext } from "@microsoft/vscode-azext-utils";
import { WorkspaceResourceProvider } from "@microsoft/vscode-azext-utils/hostapi";
import * as path from 'path';
import { Disposable, workspace, WorkspaceFolder } from "vscode";
import { tryGetFunctionProjectRoot } from "./commands/createNewProject/verifyIsProject";
import { getFunctionAppName, getJavaDebugSubpath } from "./commands/initProjectForVSCode/InitVSCodeStep/JavaInitVSCodeStep";
import { funcVersionSetting, JavaBuildTool, javaBuildTool, ProjectLanguage, projectLanguageSetting } from "./constants";
import { FuncVersion, tryParseFuncVersion } from "./FuncVersion";
import { localize } from "./localize";
import { InitLocalProjectTreeItem } from "./tree/localProject/InitLocalProjectTreeItem";
import { InvalidLocalProjectTreeItem } from "./tree/localProject/InvalidLocalProjectTreeItem";
import { LocalProjectTreeItem } from "./tree/localProject/LocalProjectTreeItem";
import { dotnetUtils } from "./utils/dotnetUtils";
import { getWorkspaceSetting } from "./vsCodeConfig/settings";

export class FunctionsLocalResourceProvider implements WorkspaceResourceProvider {

    public disposables: Disposable[] = [];

    public async provideResources(parent: AzExtParentTreeItem): Promise<AzExtTreeItem[] | null | undefined> {

        return await callWithTelemetryAndErrorHandling('AzureAccountTreeItemWithProjects.provideResources', async (context: IActionContext) => {
            const children: AzExtTreeItem[] = [];

            Disposable.from(...this._projectDisposables).dispose();
            this._projectDisposables = [];

            const folders: readonly WorkspaceFolder[] = workspace.workspaceFolders || [];
            for (const folder of folders) {
                const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, folder);
                if (projectPath) {
                    try {
                        const language: ProjectLanguage | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
                        const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, projectPath));
                        if (language === undefined || version === undefined) {
                            children.push(new InitLocalProjectTreeItem(parent, projectPath, folder));
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


                            const treeItem: LocalProjectTreeItem = new LocalProjectTreeItem(parent, { effectiveProjectPath, folder, language, version, preCompiledProjectPath, isIsolated });
                            this._projectDisposables.push(treeItem);
                            children.push(treeItem);
                        }
                    } catch (error) {
                        children.push(new InvalidLocalProjectTreeItem(parent, projectPath, error, folder));
                    }
                }
            }
            return children;
        });
    }
    private _projectDisposables: Disposable[] = [];

    public dispose(): void {
        Disposable.from(...this._projectDisposables).dispose();
    }
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
    } else {
        return undefined;
    }
}
