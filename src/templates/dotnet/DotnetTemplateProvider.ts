/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { homedir } from 'os';
import * as path from 'path';
import { RelativePattern, workspace } from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../constants';
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { cliFeedUtils } from '../../utils/cliFeedUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { parseJson } from '../../utils/parseJson';
import { requestUtils } from '../../utils/requestUtils';
import { IBindingTemplate } from '../IBindingTemplate';
import { IFunctionTemplate } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { executeDotnetTemplateCommand, getDotnetItemTemplatePath, getDotnetProjectTemplatePath, getDotnetTemplatesPath, validateDotnetInstalled } from './executeDotnetTemplateCommand';
import { parseDotnetTemplates } from './parseDotnetTemplates';

export class DotnetTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Dotnet;

    public constructor(version: FuncVersion, projectPath: string | undefined, language: ProjectLanguage) {
        super(version, projectPath, language);
        if (projectPath) {
            const projGlob = language === ProjectLanguage.FSharp ? '*.fsproj' : '*.csproj';
            const watcher = workspace.createFileSystemWatcher(new RelativePattern(projectPath, projGlob));
            this._disposables.push(watcher);
            this._disposables.push(watcher.onDidChange(() => { this.projKeyMayHaveChanged(); }));
            this._disposables.push(watcher.onDidDelete(() => { this.projKeyMayHaveChanged(); }));
            this._disposables.push(watcher.onDidCreate(() => { this.projKeyMayHaveChanged(); }));
        }
    }

    protected get backupSubpath(): string {
        return path.join('dotnet', this.version);
    }

    private _rawTemplates: object[];

    public async refreshProjKey(): Promise<string> {
        return await dotnetUtils.getTemplateKeyFromProjFile(this.projectPath, this.version, this.language);
    }

    public async getCachedTemplates(): Promise<ITemplates | undefined> {
        const projKey = await this.getProjKey();
        const projectFilePath: string = getDotnetProjectTemplatePath(this.version, projKey);
        const itemFilePath: string = getDotnetItemTemplatePath(this.version, projKey);
        if (!await fse.pathExists(projectFilePath) || !await fse.pathExists(itemFilePath)) {
            return undefined;
        }

        const cachedDotnetTemplates: object[] | undefined = await this.getCachedValue(projKey);
        if (cachedDotnetTemplates) {
            return await parseDotnetTemplates(cachedDotnetTemplates, this.version);
        } else {
            return undefined;
        }
    }

    public async getLatestTemplateVersion(): Promise<string> {
        return await cliFeedUtils.getLatestVersion(this.version);
    }

    public async getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        await validateDotnetInstalled(context);

        const funcRelease: cliFeedUtils.IRelease = await cliFeedUtils.getRelease(latestTemplateVersion);

        const projKey = await this.getProjKey();
        const projectFilePath: string = getDotnetProjectTemplatePath(this.version, projKey);
        const itemFilePath: string = getDotnetItemTemplatePath(this.version, projKey);

        const netRelease = Object.values(funcRelease.workerRuntimes.dotnet).find(r => projKey === dotnetUtils.getTemplateKeyFromFeedEntry(r));
        if (!netRelease) {
            throw new Error(localize('failedToFindNetRelease', 'Failed to find templates for .NET worker "{0}".', projKey))
        }

        await Promise.all([
            requestUtils.downloadFile(netRelease.projectTemplates, projectFilePath),
            requestUtils.downloadFile(netRelease.itemTemplates, itemFilePath)
        ]);

        return await this.parseTemplates(context, projKey);
    }

    public async getBackupTemplates(context: IActionContext): Promise<ITemplates> {
        const projKey = await this.getProjKey();
        const backupPath: string = this.getBackupPath();
        const files: string[] = [getDotnetProjectTemplatePath(this.version, projKey), getDotnetItemTemplatePath(this.version, projKey)];
        for (const file of files) {
            await fse.copy(path.join(backupPath, path.basename(file)), file);
        }
        return await this.parseTemplates(context, projKey);
    }

    public async updateBackupTemplates(): Promise<void> {
        const projKey = await this.getProjKey();
        const backupPath: string = this.getBackupPath();
        const files: string[] = [getDotnetProjectTemplatePath(this.version, projKey), getDotnetItemTemplatePath(this.version, projKey)];
        for (const file of files) {
            await fse.copy(file, path.join(backupPath, path.basename(file)));
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async cacheTemplates(): Promise<void> {
        const projKey = await this.getProjKey();
        await this.updateCachedValue(projKey, this._rawTemplates);
    }

    public async clearCachedTemplates(): Promise<void> {
        const projKey = await this.getProjKey();
        await this.deleteCachedValue(projKey);
        const templateEnginePath: string = path.join(homedir(), '.templateengine', 'AzureFunctions-VSCodeExtension'); // This is used by the JsonCli tool
        for (const dir of [getDotnetTemplatesPath(), templateEnginePath]) {
            await fse.remove(dir);
        }
    }

    private async parseTemplates(context: IActionContext, projKey: string): Promise<ITemplates> {
        this._rawTemplates = parseJson(await executeDotnetTemplateCommand(context, this.version, projKey, undefined, 'list'));
        return parseDotnetTemplates(this._rawTemplates, this.version);
    }

    public includeTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        const isIsolated = (v: string) => v.toLowerCase().includes('isolated');
        return !('id' in template) || !this.sessionProjKey || isIsolated(template.id) === isIsolated(this.sessionProjKey);
    }
}
