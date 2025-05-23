/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingsTreeItem, isSettingConnectionString } from '@microsoft/vscode-azext-azureappsettings';
import { callWithTelemetryAndErrorHandling, type AzExtParentTreeItem, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Disposable, type TaskScope, type WorkspaceFolder } from 'vscode';
import { type FuncVersion } from '../../FuncVersion';
import { LocalSettingsClientProvider } from '../../commands/appSettings/localSettings/LocalSettingsClient';
import { tryGetLocalSettingsFileNoPrompt } from '../../commands/appSettings/localSettings/getLocalSettingsFile';
import { onDotnetFuncTaskReady } from '../../commands/pickFuncProcess';
import { functionJsonFileName, localSettingsFileName, type ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { type IParsedHostJson } from '../../funcConfig/host';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { onFuncTaskStarted } from '../../funcCoreTools/funcHostTask';
import { type LocalProjectInternal } from '../../workspace/listLocalProjects';
import { type ApplicationSettings, type FuncHostRequest, type IProjectTreeItem } from '../IProjectTreeItem';
import { ProjectResource, ProjectSource, isLocalProjectCV, matchesAnyPart } from '../projectContextValues';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';
import { LocalProjectTreeItemBase } from './LocalProjectTreeItemBase';
import { createRefreshFileWatcher } from './createRefreshFileWatcher';


export class LocalProjectTreeItem extends LocalProjectTreeItemBase implements Disposable, IProjectTreeItem {
    public static contextValue: string = 'azFuncLocalProject';
    public contextValue: string = LocalProjectTreeItem.contextValue;
    public readonly source: ProjectSource = ProjectSource.Local;
    public readonly effectiveProjectPath: string;
    public readonly preCompiledProjectPath: string | undefined;
    public readonly workspacePath: string;
    public readonly workspaceFolder: WorkspaceFolder;
    public readonly version: FuncVersion;
    public readonly language: ProjectLanguage;
    public readonly languageModel: number | undefined;
    public readonly isIsolated: boolean;
    public readonly project: LocalProjectInternal;

    private readonly _disposables: Disposable[] = [];
    private readonly _localFunctionsTreeItem: LocalFunctionsTreeItem;
    private readonly _localSettingsTreeItem: AppSettingsTreeItem;

    public constructor(parent: AzExtParentTreeItem, localProject: LocalProjectInternal) {
        const options = localProject.options;
        super(parent, options.preCompiledProjectPath || options.effectiveProjectPath, options.folder);
        this.effectiveProjectPath = options.effectiveProjectPath;
        this.workspacePath = options.folder.uri.fsPath;
        this.workspaceFolder = options.folder;
        this.preCompiledProjectPath = options.preCompiledProjectPath;
        this.version = options.version;
        this.language = options.language;
        this.languageModel = options.languageModel;
        this.isIsolated = !!options.isIsolated;
        this.project = localProject;

        this._disposables.push(createRefreshFileWatcher(this, path.join(this.effectiveProjectPath, '*', functionJsonFileName)));
        this._disposables.push(createRefreshFileWatcher(this, path.join(this.effectiveProjectPath, localSettingsFileName)));

        this._disposables.push(onFuncTaskStarted(async scope => this.onFuncTaskChanged(scope)));
        this._disposables.push(onDotnetFuncTaskReady(async scope => this.onFuncTaskChanged(scope)));

        this._localFunctionsTreeItem = new LocalFunctionsTreeItem(this);
        this._localSettingsTreeItem = new AppSettingsTreeItem(this, new LocalSettingsClientProvider(this.workspaceFolder), ext.prefix, {
            contextValuesToAdd: ['localSettings']
        });
    }

    static async createLocalProjectTreeItem(parent: AzExtParentTreeItem, localProject: LocalProjectInternal): Promise<LocalProjectTreeItem> {
        const result = await callWithTelemetryAndErrorHandling('createlocalProjectTreeItem', async (context: IActionContext) => {
            const ti: LocalProjectTreeItem = new LocalProjectTreeItem(parent, localProject);
            await ti.refresh(context);
            return ti;
        });
        return result ?? new LocalProjectTreeItem(parent, localProject);
    }

    public async getHostRequest(context: IActionContext): Promise<FuncHostRequest> {
        return this.project.getHostRequest(context);
    }

    public dispose(): void {
        Disposable.from(...this._disposables).dispose();
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        return [this._localFunctionsTreeItem, this._localSettingsTreeItem];
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

    public async getHostJson(context: IActionContext): Promise<IParsedHostJson> {
        return this.project.getHostJson(context);
    }

    public async getVersion(context: IActionContext): Promise<FuncVersion> {
        return this.project.getVersion(context);
    }

    public async getApplicationSettings(context: IActionContext): Promise<ApplicationSettings> {
        return this.project.getApplicationSettings(context);
    }

    public async setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void> {
        await this.project.setApplicationSetting(context, key, value);
    }

    private async onFuncTaskChanged(scope: WorkspaceFolder | TaskScope | undefined): Promise<void> {
        await callWithTelemetryAndErrorHandling('onFuncTaskChanged', async (context: IActionContext) => {
            if (this.workspaceFolder === scope) {
                context.errorHandling.suppressDisplay = true;
                context.telemetry.suppressIfSuccessful = true;
                await this.refresh(context);
            }
        });
    }

    public async refreshImpl(context: IActionContext): Promise<void> {
        const localSettingsPath: string | undefined = await tryGetLocalSettingsFileNoPrompt(context, this.project.options.folder);
        if (localSettingsPath) {
            const localSettings = await getLocalSettingsJson(context, localSettingsPath, false);
            if (localSettings.Values) {
                for (const [key, value] of Object.entries(localSettings.Values)) {
                    if (!isSettingConnectionString(key, value)) {
                        continue;
                    }

                    this.contextValue = 'azFuncLocalProject;convert';
                }
            }
        }
    }
}
