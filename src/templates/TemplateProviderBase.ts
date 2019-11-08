/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { IBindingTemplate } from './IBindingTemplate';
import { IFunctionTemplate } from './IFunctionTemplate';
import { ITemplates } from './ITemplates';

const v3BackupTemplatesVersion: string = '3.0.2';
const v2BackupTemplatesVersion: string = '2.42.0';
const v1BackupTemplatesVersion: string = '1.10.0';

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

    public constructor(version: FuncVersion, projectPath: string | undefined) {
        this.version = version;
        this.projectPath = projectPath;
    }

    /**
     * Adds version, templateType, and language information to a key to ensure there are no collisions in the cache
     * For backwards compatability, the original version, templateType, and language will not have this information
     */
    public getCacheKey(key: string): string {
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

    public abstract getLatestTemplateVersion(): Promise<string>;
    public abstract getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates>;
    public abstract getCachedTemplates(): Promise<ITemplates | undefined>;
    public abstract getBackupTemplates(): Promise<ITemplates>;
    public abstract cacheTemplates(): Promise<void>;

    /**
     * Unless this is overidden, all templates will be included
     */
    public includeTemplate(_template: IFunctionTemplate | IBindingTemplate): boolean {
        return true;
    }

    public async getCachedTemplateVersion(): Promise<string | undefined> {
        return ext.context.globalState.get(this.getCacheKey(TemplateProviderBase.templateVersionKey));
    }

    public getBackupTemplateVersion(): string {
        switch (this.version) {
            case FuncVersion.v1:
                return v1BackupTemplatesVersion;
            case FuncVersion.v2:
                return v2BackupTemplatesVersion;
            case FuncVersion.v3:
                return v3BackupTemplatesVersion;
            default:
                throw new RangeError(localize('invalidVersion', 'Invalid version "{0}".', this.version));
        }
    }
}
