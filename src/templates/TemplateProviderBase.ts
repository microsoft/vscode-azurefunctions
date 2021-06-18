/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { Disposable, env } from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../constants';
import { NotImplementedError } from '../errors';
import { ext } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { IBindingTemplate } from './IBindingTemplate';
import { IFunctionTemplate } from './IFunctionTemplate';
import { ITemplates } from './ITemplates';

export enum TemplateType {
    Script = 'Script',
    ScriptBundle = 'ScriptBundle',
    Dotnet = '.NET',
    Java = 'Java'
}

export abstract class TemplateProviderBase implements Disposable {
    protected static templateVersionCacheKey: string = 'templateVersion';
    protected static projTemplateKeyCacheKey: string = 'projectTemplateKey';
    public abstract templateType: TemplateType;
    public readonly version: FuncVersion;
    public readonly language: ProjectLanguage;
    public readonly projectPath: string | undefined;
    public resourcesLanguage: string | undefined;

    /**
     * Indicates a related setting/file changed, so we should refresh the worker runtime key next time we get templates
     * We want to delay reading those files until necessary for performance reasons, hence "may have"
     */
    private _projKeyMayHaveChanged: boolean;

    /**
     * The project key cached for this session of VS Code, purely meant for performance (since we don't want to read the file system to get detect the proj key every time)
     * NOTE: Not using "cache" in the name because all other "cache" properties/methods are related to the global state cache we use accross sessions
     */
    protected _sessionProjKey: string | undefined;

    protected abstract backupSubpath: string;
    protected _disposables: Disposable[] = [];

    public constructor(version: FuncVersion, projectPath: string | undefined, language: ProjectLanguage, projectTemplateKey: string | undefined) {
        this.version = version;
        this.projectPath = projectPath;
        this.language = language;
        this._sessionProjKey = projectTemplateKey;
    }

    public dispose(): void {
        Disposable.from(...this._disposables).dispose();
    }

    protected async updateCachedValue(key: string, value: unknown): Promise<void> {
        await ext.context.globalState.update(await this.getCacheKey(key), value);
    }

    protected async deleteCachedValue(key: string): Promise<void> {
        await ext.context.globalState.update(await this.getCacheKey(key), undefined);
    }

    protected async getCachedValue<T>(key: string): Promise<T | undefined> {
        return ext.context.globalState.get<T>(await this.getCacheKey(key));
    }

    public abstract getLatestTemplateVersion(context: IActionContext): Promise<string>;
    public abstract getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates>;
    public abstract getCachedTemplates(context: IActionContext): Promise<ITemplates | undefined>;
    public abstract getBackupTemplates(context: IActionContext): Promise<ITemplates>;
    public abstract cacheTemplates(context: IActionContext): Promise<void>;
    public abstract clearCachedTemplates(context: IActionContext): Promise<void>;
    public abstract updateBackupTemplates(context: IActionContext): Promise<void>;

    /**
     * Unless this is overidden, all templates will be included
     */
    public includeTemplate(_template: IFunctionTemplate | IBindingTemplate): boolean {
        return true;
    }

    public async getCachedTemplateVersion(): Promise<string | undefined> {
        return this.getCachedValue(TemplateProviderBase.templateVersionCacheKey);
    }

    public async cacheTemplateMetadata(templateVersion: string): Promise<void> {
        await this.updateCachedValue(TemplateProviderBase.templateVersionCacheKey, templateVersion);
        await this.updateCachedValue(TemplateProviderBase.projTemplateKeyCacheKey, this._sessionProjKey);
    }

    public async clearCachedTemplateMetadata(): Promise<void> {
        await this.deleteCachedValue(TemplateProviderBase.templateVersionCacheKey);
        await this.deleteCachedValue(TemplateProviderBase.projTemplateKeyCacheKey);
    }

    public async getBackupTemplateVersion(): Promise<string> {
        return (await fse.readFile(await this.getBackupVersionPath())).toString().trim();
    }

    public async updateBackupTemplateVersion(version: string): Promise<void> {
        const filePath: string = await this.getBackupVersionPath();
        await fse.ensureFile(filePath);
        await fse.writeFile(filePath, version);
    }

    protected getBackupPath(): string {
        return ext.context.asAbsolutePath(path.join('resources', 'backupTemplates', this.backupSubpath));
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    protected async getCacheKeySuffix(): Promise<string> {
        return '';
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    private async getBackupVersionPath(): Promise<string> {
        return path.join(this.getBackupPath(), 'version.txt');
    }

    /**
     * Adds version, templateType, and language information to a key to ensure there are no collisions in the cache
     * For backwards compatibility, the original version, templateType, and language will not have this information
     */
    private async getCacheKey(key: string): Promise<string> {
        key = key + await this.getCacheKeySuffix();

        if (this.version !== FuncVersion.v1) {
            key = `${key}.${this.version}`;
        }

        if (this.templateType !== TemplateType.Script) {
            key = `${key}.${this.templateType}`;
        }

        if (env.language && !/^en(-us)?$/i.test(env.language)) {
            key = `${key}.${env.language}`;
        }

        return key;
    }

    /**
     * Optional method if the provider has project-specific templates
     */
    protected refreshProjKey?(): Promise<string>;

    /**
     * A key used to identify the templates for the current type of project
     */
    public async getProjKey(): Promise<string> {
        if (!this.refreshProjKey) {
            throw new NotImplementedError('refreshProjKey', this);
        }

        if (!this._sessionProjKey) {
            this._sessionProjKey = await this.refreshProjKey();
        }

        return this._sessionProjKey;
    }

    public projKeyMayHaveChanged(): void {
        this._projKeyMayHaveChanged = true;
    }

    /**
     * Returns true if the key changed
     */
    public async updateProjKeyIfChanged(projKey: string | undefined): Promise<boolean> {
        let hasChanged: boolean;
        if (!this.refreshProjKey) {
            hasChanged = false; // proj keys not supported, so it's impossible to have changed
        } else if (projKey) {
            hasChanged = this._sessionProjKey !== projKey;
            this._sessionProjKey = projKey;
        } else if (this._projKeyMayHaveChanged) {
            const latestProjKey = await this.refreshProjKey();
            hasChanged = this._sessionProjKey !== latestProjKey;
            this._sessionProjKey = latestProjKey;
        } else {
            hasChanged = false;
        }

        this._projKeyMayHaveChanged = false;
        return hasChanged;
    }

    public async doesCachedProjKeyMatch(): Promise<boolean> {
        if (this.refreshProjKey) {
            const projKey = await this.getProjKey();
            const cachedProjKey = await this.getCachedValue(TemplateProviderBase.projTemplateKeyCacheKey);
            // If cachedProjKey is not defined, assumes it's a match (the cache is probably from before proj keys were a thing)
            return !cachedProjKey || projKey === cachedProjKey;
        } else {
            return true; // Proj keys are not supported, so assume a match
        }
    }
}
