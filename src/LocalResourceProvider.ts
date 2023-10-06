/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AzExtParentTreeItem, AzExtTreeItem } from "@microsoft/vscode-azext-utils";
import { WorkspaceResourceProvider } from "@microsoft/vscode-azext-utils/hostapi";
import { Disposable } from "vscode";
import { InitLocalProjectTreeItem } from "./tree/localProject/InitLocalProjectTreeItem";
import { InvalidLocalProjectTreeItem } from "./tree/localProject/InvalidLocalProjectTreeItem";
import { LocalProjectTreeItem } from "./tree/localProject/LocalProjectTreeItem";
import { listLocalProjects } from "./workspace/listLocalProjects";

export class FunctionsLocalResourceProvider implements WorkspaceResourceProvider {

    public disposables: Disposable[] = [];

    public async provideResources(parent: AzExtParentTreeItem): Promise<AzExtTreeItem[] | null | undefined> {
        const children: AzExtTreeItem[] = [];

        Disposable.from(...this._projectDisposables).dispose();
        this._projectDisposables = [];

        const localProjects = await listLocalProjects();

        for (const project of localProjects.initializedProjects) {
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
