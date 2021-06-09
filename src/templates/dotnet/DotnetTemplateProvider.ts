/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { RelativePattern, workspace } from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion, getMajorVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { cliFeedUtils } from '../../utils/cliFeedUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { nonNullValue } from '../../utils/nonNull';
import { parseJson } from '../../utils/parseJson';
import { requestUtils } from '../../utils/requestUtils';
import { IBindingTemplate } from '../IBindingTemplate';
import { IFunctionTemplate } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';
import { TemplateProviderBase, TemplateType } from '../TemplateProviderBase';
import { executeDotnetTemplateCommand, getDotnetItemTemplatePath, getDotnetProjectTemplatePath, getDotnetTemplateDir, validateDotnetInstalled } from './executeDotnetTemplateCommand';
import { parseDotnetTemplates } from './parseDotnetTemplates';

export class DotnetTemplateProvider extends TemplateProviderBase {
    public templateType: TemplateType = TemplateType.Dotnet;

    public constructor(version: FuncVersion, projectPath: string | undefined, language: ProjectLanguage, projectTemplateKey: string | undefined) {
        super(version, projectPath, language, projectTemplateKey);
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

    public async getLatestTemplateVersion(context: IActionContext): Promise<string> {
        const projKey = await this.getProjKey();

        let templateVersion = await cliFeedUtils.getLatestVersion(this.version);
        let netRelease = await this.getNetRelease(projKey, templateVersion);
        if (netRelease) {
            return templateVersion;
        } else {
            for (const newVersion of Object.values(FuncVersion)) {
                if (newVersion !== this.version) {
                    templateVersion = await cliFeedUtils.getLatestVersion(newVersion);
                    netRelease = await this.getNetRelease(projKey, templateVersion);
                    if (netRelease) {
                        context.telemetry.properties.effectiveProjectRuntime = newVersion;
                        const oldMajorVersion = getMajorVersion(this.version);
                        const newMajorVersion = getMajorVersion(newVersion);
                        const warning = localize('mismatchProjKeyWarning', 'WARNING: "{0}" is not supported on Azure Functions v{1}. Using templates from v{2} instead.', projKey, oldMajorVersion, newMajorVersion);
                        ext.outputChannel.appendLog(warning);
                        return templateVersion;
                    }
                }
            }
            throw new Error(localize('projKeyError', '"{0}" is not supported for Azure Functions version "{1}".', projKey, this.version));
        }
    }

    public async getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        await validateDotnetInstalled(context);

        const projKey = await this.getProjKey();
        const projectFilePath: string = getDotnetProjectTemplatePath(this.version, projKey);
        const itemFilePath: string = getDotnetItemTemplatePath(this.version, projKey);

        const netRelease = nonNullValue(await this.getNetRelease(projKey, latestTemplateVersion), 'netRelease');
        await Promise.all([
            requestUtils.downloadFile(netRelease.projectTemplates, projectFilePath),
            requestUtils.downloadFile(netRelease.itemTemplates, itemFilePath)
        ]);

        return await this.parseTemplates(context, projKey);
    }

    private async getNetRelease(projKey: string, templateVersion: string): Promise<cliFeedUtils.IWorkerRuntime | undefined> {
        const funcRelease: cliFeedUtils.IRelease = await cliFeedUtils.getRelease(templateVersion);
        return Object.values(funcRelease.workerRuntimes.dotnet).find(r => projKey === dotnetUtils.getTemplateKeyFromFeedEntry(r));
    }

    public async getBackupTemplates(context: IActionContext): Promise<ITemplates> {
        const projKey = await this.getProjKey();
        const files: string[] = [getDotnetProjectTemplatePath(this.version, projKey), getDotnetItemTemplatePath(this.version, projKey)];
        for (const file of files) {
            await fse.copy(this.convertToBackupFilePath(projKey, file), file);
        }
        return await this.parseTemplates(context, projKey);
    }

    public async updateBackupTemplates(): Promise<void> {
        const projKey = await this.getProjKey();
        const files: string[] = [getDotnetProjectTemplatePath(this.version, projKey), getDotnetItemTemplatePath(this.version, projKey)];
        for (const file of files) {
            await fse.copy(file, this.convertToBackupFilePath(projKey, file));
        }
    }

    private convertToBackupFilePath(projKey: string, file: string): string {
        return path.join(this.getBackupPath(), projKey, path.basename(file));
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async cacheTemplates(): Promise<void> {
        const projKey = await this.getProjKey();
        await this.updateCachedValue(projKey, this._rawTemplates);
    }

    public async clearCachedTemplates(): Promise<void> {
        const projKey = await this.getProjKey();
        await this.deleteCachedValue(projKey);
        await fse.remove(getDotnetTemplateDir(this.version, projKey));
    }

    private async parseTemplates(context: IActionContext, projKey: string): Promise<ITemplates> {
        this._rawTemplates = parseJson(await executeDotnetTemplateCommand(context, this.version, projKey, undefined, 'list'));
        return parseDotnetTemplates(this._rawTemplates, this.version);
    }

    public includeTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        const isIsolated = (v: string) => v.toLowerCase().includes('isolated');
        return !('id' in template) || !this._sessionProjKey || isIsolated(template.id) === isIsolated(this._sessionProjKey);
    }
}
