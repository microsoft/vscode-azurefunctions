/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { Disposable, WorkspaceFolder } from 'vscode';
import { AzExtParentTreeItem, AzExtTreeItem } from 'vscode-azureextensionui';
import { functionJsonFileName, hostFileName, localSettingsFileName, ProjectLanguage } from '../../constants';
import { IParsedHostJson, parseHostJson } from '../../funcConfig/host';
import { getLocalSettingsJson, ILocalSettingsJson } from '../../funcConfig/local.settings';
import { FuncVersion } from '../../FuncVersion';
import { ApplicationSettings, IProjectTreeItem } from '../IProjectTreeItem';
import { isLocalProjectCV, matchesAnyPart, ProjectResource, ProjectSource } from '../projectContextValues';
import { createRefreshFileWatcher } from './createRefreshFileWatcher';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';
import { LocalProjectTreeItemBase } from './LocalProjectTreeItemBase';

export class LocalProjectTreeItem extends LocalProjectTreeItemBase implements Disposable, IProjectTreeItem {
    public static contextValue: string = 'azFuncLocalProject';
    public contextValue: string = LocalProjectTreeItem.contextValue;
    public readonly source: ProjectSource = ProjectSource.Local;
    public readonly effectiveProjectPath: string;
    public readonly preCompiledProjectPath: string | undefined;
    public readonly workspacePath: string;
    public readonly workspaceFolder: WorkspaceFolder;
    public readonly version: FuncVersion;
    public readonly langauge: ProjectLanguage;

    private readonly _disposables: Disposable[] = [];
    private readonly _localFunctionsTreeItem: LocalFunctionsTreeItem;

    public constructor(parent: AzExtParentTreeItem, options: { effectiveProjectPath: string; folder: WorkspaceFolder; version: FuncVersion; language: ProjectLanguage; preCompiledProjectPath?: string }) {
        super(parent, options.preCompiledProjectPath || options.effectiveProjectPath);
        this.effectiveProjectPath = options.effectiveProjectPath;
        this.workspacePath = options.folder.uri.fsPath;
        this.workspaceFolder = options.folder;
        this.preCompiledProjectPath = options.preCompiledProjectPath;
        this.version = options.version;
        this.langauge = options.language;

        this._disposables.push(createRefreshFileWatcher(this, path.join(this.effectiveProjectPath, '*', functionJsonFileName)));
        this._disposables.push(createRefreshFileWatcher(this, path.join(this.effectiveProjectPath, localSettingsFileName)));

        this._localFunctionsTreeItem = new LocalFunctionsTreeItem(this);
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
            if (matchesAnyPart(expectedContextValue, ProjectResource.Functions, ProjectResource.Function)) {
                return this._localFunctionsTreeItem;
            }
        }

        return undefined;
    }

    public async getHostJson(): Promise<IParsedHostJson> {
        const version: FuncVersion = await this.getVersion();
        // tslint:disable-next-line: no-any
        const data: any = await fse.readJSON(path.join(this.effectiveProjectPath, hostFileName));
        return parseHostJson(data, version);
    }

    public async getVersion(): Promise<FuncVersion> {
        return this.version;
    }

    public async getApplicationSettings(): Promise<ApplicationSettings> {
        const localSettings: ILocalSettingsJson = await getLocalSettingsJson(path.join(this.effectiveProjectPath, localSettingsFileName));
        // tslint:disable-next-line: strict-boolean-expressions
        return localSettings.Values || {};
    }
}
