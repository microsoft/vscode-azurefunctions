/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, nonNullValue } from '@microsoft/vscode-azext-utils';
import * as fse from 'fs-extra';
import * as path from 'path';
import { RelativePattern, workspace } from 'vscode';
import { ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion, getMajorVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { cliFeedUtils } from '../../utils/cliFeedUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
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

    public async refreshProjKey(context: IActionContext): Promise<string> {
        return await dotnetUtils.getTemplateKeyFromProjFile(context, this.projectPath, this.version, this.language);
    }

    public async getCachedTemplates(context: IActionContext): Promise<ITemplates | undefined> {
        const projKey = await this.getProjKey(context);
        const projectFilePath: string = getDotnetProjectTemplatePath(context, this.version, projKey);
        const itemFilePath: string = getDotnetItemTemplatePath(context, this.version, projKey);
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
        const projKey = await this.getProjKey(context);

        const templateVersion = await cliFeedUtils.getLatestVersion(context, this.version);
        let netRelease = await this.getNetRelease(context, projKey, templateVersion);
        if (netRelease) {
            return templateVersion;
        } else {
            const templateVersions = await cliFeedUtils.getSortedVersions(context, this.version);
            for (const newTemplateVersion of templateVersions) {
                try {
                    netRelease = await this.getNetRelease(context, projKey, newTemplateVersion);
                    if (netRelease) {
                        const latestFuncRelease = await cliFeedUtils.getRelease(context, templateVersion);
                        const latestProjKeys = Object.values(latestFuncRelease.workerRuntimes.dotnet).map(r => dotnetUtils.getTemplateKeyFromFeedEntry(r));
                        const warning = localize('oldProjKeyWarning', 'WARNING: "{0}" does not support the latest templates. Use "{1}" for the latest.', projKey, latestProjKeys.join('", "'));
                        ext.outputChannel.appendLog(warning);
                        return newTemplateVersion;
                    }
                } catch {
                    // ignore and try next version
                }
            }

            for (const newFuncVersion of Object.values(FuncVersion)) {
                try {
                    if (newFuncVersion !== this.version) {
                        const newTemplateVersion = await cliFeedUtils.getLatestVersion(context, newFuncVersion);
                        netRelease = await this.getNetRelease(context, projKey, newTemplateVersion);
                        if (netRelease) {
                            context.telemetry.properties.effectiveProjectRuntime = newFuncVersion;
                            const oldMajorVersion = getMajorVersion(this.version);
                            const newMajorVersion = getMajorVersion(newFuncVersion);
                            const warning = localize('mismatchProjKeyWarning', 'WARNING: "{0}" is not supported on Azure Functions v{1}. Using templates from v{2} instead.', projKey, oldMajorVersion, newMajorVersion);
                            ext.outputChannel.appendLog(warning);
                            return newTemplateVersion;
                        }
                    }
                } catch {
                    // ignore and try next version
                }
            }
            throw new Error(localize('projKeyError', '"{0}" is not supported for Azure Functions version "{1}".', projKey, this.version));
        }
    }

    public async getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        await validateDotnetInstalled(context);

        const projKey = await this.getProjKey(context);
        const projectFilePath: string = getDotnetProjectTemplatePath(context, this.version, projKey);
        const itemFilePath: string = getDotnetItemTemplatePath(context, this.version, projKey);

        const netRelease = nonNullValue(await this.getNetRelease(context, projKey, latestTemplateVersion), 'netRelease');
        await Promise.all([
            requestUtils.downloadFile(context, netRelease.projectTemplates, projectFilePath),
            requestUtils.downloadFile(context, netRelease.itemTemplates, itemFilePath)
        ]);

        return await this.parseTemplates(context, projKey);
    }

    private async getNetRelease(context: IActionContext, projKey: string, templateVersion: string): Promise<cliFeedUtils.IWorkerRuntime | undefined> {
        const funcRelease: cliFeedUtils.IRelease = await cliFeedUtils.getRelease(context, templateVersion);
        return Object.values(funcRelease.workerRuntimes.dotnet).find(r => projKey === dotnetUtils.getTemplateKeyFromFeedEntry(r));
    }

    public async getBackupTemplates(context: IActionContext): Promise<ITemplates> {
        const projKey = await this.getProjKey(context);
        const files: string[] = [getDotnetProjectTemplatePath(context, this.version, projKey), getDotnetItemTemplatePath(context, this.version, projKey)];
        for (const file of files) {
            await fse.copy(this.convertToBackupFilePath(projKey, file), file);
        }
        return await this.parseTemplates(context, projKey);
    }

    public async updateBackupTemplates(context: IActionContext): Promise<void> {
        const projKey = await this.getProjKey(context);
        const files: string[] = [getDotnetProjectTemplatePath(context, this.version, projKey), getDotnetItemTemplatePath(context, this.version, projKey)];
        for (const file of files) {
            await fse.copy(file, this.convertToBackupFilePath(projKey, file));
        }
    }

    private convertToBackupFilePath(projKey: string, file: string): string {
        return path.join(this.getBackupPath(), projKey, path.basename(file));
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async cacheTemplates(context: IActionContext): Promise<void> {
        const projKey = await this.getProjKey(context);
        await this.updateCachedValue(projKey, this._rawTemplates);
    }

    public async clearCachedTemplates(context: IActionContext): Promise<void> {
        const projKey = await this.getProjKey(context);
        await this.deleteCachedValue(projKey);
        await fse.remove(getDotnetTemplateDir(context, this.version, projKey));
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
