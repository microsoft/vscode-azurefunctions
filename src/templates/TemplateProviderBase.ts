/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
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

export abstract class TemplateProviderBase {
    public static templateVersionKey: string = 'templateVersion';
    public abstract templateType: TemplateType;
    public readonly version: FuncVersion;
    public readonly projectPath: string | undefined;
    public resourcesLanguage: string | undefined;

    protected abstract backupSubpath: string;

    public constructor(version: FuncVersion, projectPath: string | undefined) {
        this.version = version;
        this.projectPath = projectPath;
    }

    public async updateCachedValue(key: string, value: unknown): Promise<void> {
        await ext.context.globalState.update(this.getCacheKey(key), value);
    }

    public async deleteCachedValue(key: string): Promise<void> {
        await ext.context.globalState.update(this.getCacheKey(key), undefined);
    }

    public getCachedValue<T>(key: string): T | undefined {
        return ext.context.globalState.get<T>(this.getCacheKey(key));
    }

    public abstract getLatestTemplateVersion(): Promise<string>;
    public abstract getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates>;
    public abstract getCachedTemplates(context: IActionContext): Promise<ITemplates | undefined>;
    public abstract getBackupTemplates(context: IActionContext): Promise<ITemplates>;
    public abstract cacheTemplates(): Promise<void>;
    public abstract clearCache(): Promise<void>;
    public abstract updateBackupTemplates(): Promise<void>;

    /**
     * Unless this is overidden, all templates will be included
     */
    public includeTemplate(_template: IFunctionTemplate | IBindingTemplate): boolean {
        return true;
    }

    public async getCachedTemplateVersion(): Promise<string | undefined> {
        return this.getCachedValue(TemplateProviderBase.templateVersionKey);
    }

    public async getBackupTemplateVersion(): Promise<string> {
        return (await fse.readFile(this.getBackupVersionPath())).toString().trim();
    }

    public async updateBackupTemplateVersion(version: string): Promise<void> {
        const filePath: string = this.getBackupVersionPath();
        await fse.ensureFile(filePath);
        await fse.writeFile(filePath, version);
    }

    protected getBackupPath(): string {
        return ext.context.asAbsolutePath(path.join('resources', 'backupTemplates', this.backupSubpath));
    }

    protected getCacheKeySuffix(): string {
        return '';
    }

    private getBackupVersionPath(): string {
        return path.join(this.getBackupPath(), 'version.txt');
    }

    /**
     * Adds version, templateType, and language information to a key to ensure there are no collisions in the cache
     * For backwards compatibility, the original version, templateType, and language will not have this information
     */
    private getCacheKey(key: string): string {
        key = key + this.getCacheKeySuffix();

        if (this.version !== FuncVersion.v1) {
            key = `${key}.${this.version}`;
        }

        if (this.templateType !== TemplateType.Script) {
            key = `${key}.${this.templateType}`;
        }

        if (vscode.env.language && !/^en(-us)?$/i.test(vscode.env.language)) {
            key = `${key}.${vscode.env.language}`;
        }

        return key;
    }
}
