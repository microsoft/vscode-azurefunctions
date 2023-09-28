/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AzExtParentTreeItem, AzExtTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { WorkspaceResourceProvider } from "@microsoft/vscode-azext-utils/hostapi";
import * as path from 'path';
import { Disposable } from "vscode";
import { getFunctionAppName, getJavaDebugSubpath } from "./commands/initProjectForVSCode/InitVSCodeStep/JavaInitVSCodeStep";
import { JavaBuildTool, ProjectLanguage, javaBuildTool } from "./constants";
import { localize } from "./localize";
import { InitLocalProjectTreeItem } from "./tree/localProject/InitLocalProjectTreeItem";
import { InvalidLocalProjectTreeItem } from "./tree/localProject/InvalidLocalProjectTreeItem";
import { LocalProjectTreeItem } from "./tree/localProject/LocalProjectTreeItem";
import { dotnetUtils } from "./utils/dotnetUtils";
import { getWorkspaceSetting } from "./vsCodeConfig/settings";
import { listLocalProjects } from "./workspace/listLocalProjects";

export class FunctionsLocalResourceProvider implements WorkspaceResourceProvider {

    public disposables: Disposable[] = [];

    public async provideResources(parent: AzExtParentTreeItem): Promise<AzExtTreeItem[] | null | undefined> {
        const children: AzExtTreeItem[] = [];

        Disposable.from(...this._projectDisposables).dispose();
        this._projectDisposables = [];

        const localProjects = await listLocalProjects();

        for (const project of localProjects.projects) {
            const treeItem: LocalProjectTreeItem = new LocalProjectTreeItem(parent, project);
            this._projectDisposables.push(treeItem);
            children.push(treeItem);
        }

        for (const unintializedProject of localProjects.unintializedProjects) {
            children.push(new InitLocalProjectTreeItem(parent, unintializedProject.projectPath, unintializedProject.workspaceFolder));
        }

        for (const invalidProject of localProjects.invalidProjects) {
            children.push(new InvalidLocalProjectTreeItem(parent, invalidProject.projectPath, invalidProject.error, invalidProject.workspaceFolder));
        }

        return children;
    }
    private _projectDisposables: Disposable[] = [];

    public dispose(): void {
        Disposable.from(...this._projectDisposables).dispose();
    }
}

export type CompiledProjectInfo = { compiledProjectPath: string; isIsolated: boolean };

export async function getCompiledProjectInfo(context: IActionContext, projectPath: string, projectLanguage: ProjectLanguage): Promise<CompiledProjectInfo | undefined> {
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
