/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { Disposable, WorkspaceFolder } from 'vscode';
import { AzExtParentTreeItem, AzExtTreeItem } from 'vscode-azureextensionui';
import { convertStringToRuntime, getWorkspaceSetting } from '../../../extension.bundle';
import { functionJsonFileName, hostFileName, localSettingsFileName, ProjectRuntime, projectRuntimeSetting } from '../../constants';
import { IParsedHostJson, parseHostJson } from '../../funcConfig/host';
import { getLocalSettingsJson, ILocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { nonNullValue } from '../../utils/nonNull';
import { treeUtils } from '../../utils/treeUtils';
import { ApplicationSettings, IProjectTreeItem } from '../IProjectTreeItem';
import { isLocalProjectCV, matchesAnyPart, ProjectResource, ProjectSource } from '../projectContextValues';
import { createRefreshFileWatcher } from './createRefreshFileWatcher';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';

export class LocalProjectTreeItem extends AzExtParentTreeItem implements Disposable, IProjectTreeItem {
    public static contextValue: string = 'azFuncLocalProject';
    public contextValue: string = LocalProjectTreeItem.contextValue;
    public readonly label: string = localize('localProject', 'Local Project');
    public readonly source: ProjectSource = ProjectSource.Local;
    public readonly projectName: string;
    public readonly projectPath: string;
    public readonly workspacePath: string;
    public readonly workspaceFolder: WorkspaceFolder;

    private _disposables: Disposable[] = [];
    private _localFunctionsTreeItem: LocalFunctionsTreeItem;

    public constructor(parent: AzExtParentTreeItem, projectPath: string, workspacePath: string, workspaceFolder: WorkspaceFolder) {
        super(parent);
        this.projectName = path.basename(projectPath);
        this.projectPath = projectPath;
        this.workspacePath = workspacePath;
        this.workspaceFolder = workspaceFolder;

        this._disposables.push(createRefreshFileWatcher(this, path.join(projectPath, '*', functionJsonFileName)));
        this._disposables.push(createRefreshFileWatcher(this, path.join(projectPath, localSettingsFileName)));

        this._localFunctionsTreeItem = new LocalFunctionsTreeItem(this);
    }

    public get iconPath(): treeUtils.IThemedIconPath {
        return treeUtils.getThemedIconPath('CreateNewProject');
    }

    public get id(): string {
        return 'localProject' + this.projectName;
    }

    public get description(): string {
        return this.projectName;
    }

    public get hostUrl(): string {
        return 'http://localhost:7071';
    }

    public dispose(): void {
        Disposable.from(...this._disposables).dispose();
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        return [this._localFunctionsTreeItem];
    }

    public isAncestorOfImpl(contextValue: string | RegExp): boolean {
        return isLocalProjectCV(contextValue);
    }

    public pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): AzExtTreeItem | undefined {
        for (const expectedContextValue of expectedContextValues) {
            if (matchesAnyPart(expectedContextValue, ProjectResource.Functions, ProjectResource.Function, ProjectResource.Bindings, ProjectResource.Binding)) {
                return this._localFunctionsTreeItem;
            }
        }

        return undefined;
    }

    public async getHostJson(): Promise<IParsedHostJson> {
        const runtime: ProjectRuntime = await this.getRuntime();
        // tslint:disable-next-line: no-any
        const data: any = await fse.readJSON(path.join(this.projectPath, hostFileName));
        return parseHostJson(data, runtime);
    }

    public async getRuntime(): Promise<ProjectRuntime> {
        const rawSetting: string | undefined = getWorkspaceSetting(projectRuntimeSetting, this.workspacePath);
        return nonNullValue(convertStringToRuntime(rawSetting), 'runtime');
    }

    public async getApplicationSettings(): Promise<ApplicationSettings> {
        const localSettings: ILocalSettingsJson = await getLocalSettingsJson(path.join(this.projectPath, localSettingsFileName));
        // tslint:disable-next-line: strict-boolean-expressions
        return localSettings.Values || {};
    }
}
