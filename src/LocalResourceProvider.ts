/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { GenericTreeItem, type AzExtParentTreeItem, type AzExtTreeItem } from "@microsoft/vscode-azext-utils";
import { type WorkspaceResourceProvider } from "@microsoft/vscode-azext-utils/hostapi";
import { Disposable } from "vscode";
import { localize } from "./localize";
import { InitLocalProjectTreeItem } from "./tree/localProject/InitLocalProjectTreeItem";
import { InvalidLocalProjectTreeItem } from "./tree/localProject/InvalidLocalProjectTreeItem";
import { LocalProjectTreeItem } from "./tree/localProject/LocalProjectTreeItem";
import { treeUtils } from "./utils/treeUtils";
import { listLocalProjects, type LocalProjectInternal } from "./workspace/listLocalProjects";

export class FunctionsLocalResourceProvider implements WorkspaceResourceProvider {

    public disposables: Disposable[] = [];

    public async provideResources(parent: AzExtParentTreeItem): Promise<AzExtTreeItem[] | null | undefined> {
        const children: AzExtTreeItem[] = [];
        Disposable.from(...this._projectDisposables).dispose();
        this._projectDisposables = [];

        const localProjects = await listLocalProjects();
        let hasLocalProject = false;

        for (const project of localProjects.initializedProjects) {
            const treeItem: LocalProjectTreeItem = await LocalProjectTreeItem.createLocalProjectTreeItem(parent, project as LocalProjectInternal);
            this._projectDisposables.push(treeItem);
            children.push(treeItem);
        }

        for (const unintializedProject of localProjects.unintializedProjects) {
            hasLocalProject = true;
            children.push(new InitLocalProjectTreeItem(parent, unintializedProject.projectPath, unintializedProject.workspaceFolder));
        }

        for (const invalidProject of localProjects.invalidProjects) {
            hasLocalProject = true;
            children.push(new InvalidLocalProjectTreeItem(parent, invalidProject.projectPath, invalidProject.error, invalidProject.workspaceFolder));
        }

        if (!hasLocalProject && children.length === 0) {
            const ti: GenericTreeItem = new GenericTreeItem(parent, {
                label: localize('createFunctionLocally', 'Create Function Project...'),
                commandId: 'azureFunctions.createNewProject',
                contextValue: 'createNewProject',
                iconPath: treeUtils.getThemedIconPath('CreateNewProject')
            });
            ti.commandArgs = [];
            children.push(ti);
        }

        return children;
    }
    private _projectDisposables: Disposable[] = [];

    public dispose(): void {
        Disposable.from(...this._projectDisposables).dispose();
    }
}
