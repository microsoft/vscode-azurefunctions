/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ITemplates } from './ITemplates';

const v2BackupTemplatesVersion: string = '2.18.1';
const v1BackupTemplatesVersion: string = '1.8.0';

export enum TemplateType {
    Script = 'Script',
    Dotnet = '.NET',
    Java = 'Java'
}

export abstract class TemplateProviderBase {
    public static templateVersionKey: string = 'templateVersion';
    public abstract templateType: TemplateType;
    public readonly runtime: ProjectRuntime;
    public readonly projectPath: string | undefined;

    public constructor(runtime: ProjectRuntime, projectPath: string | undefined) {
        this.runtime = runtime;
        this.projectPath = projectPath;
    }

    /**
     * Adds runtime, templateType, and language information to a key to ensure there are no collisions in the cache
     * For backwards compatability, the original runtime, templateType, and language will not have this information
     */
    public getCacheKey(key: string): string {
        if (this.runtime !== ProjectRuntime.v1) {
            key = `${key}.${this.runtime}`;
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
    public abstract getLatestTemplates(context: IActionContext): Promise<ITemplates>;
    public abstract getCachedTemplates(): Promise<ITemplates | undefined>;
    public abstract getBackupTemplates(): Promise<ITemplates>;
    public abstract cacheTemplates(): Promise<void>;

    public async getCachedTemplateVersion(): Promise<string | undefined> {
        return ext.context.globalState.get(this.getCacheKey(TemplateProviderBase.templateVersionKey));
    }

    public getBackupTemplateVersion(): string {
        switch (this.runtime) {
            case ProjectRuntime.v1:
                return v1BackupTemplatesVersion;
            case ProjectRuntime.v2:
                return v2BackupTemplatesVersion;
            default:
                throw new RangeError(localize('invalidRuntime', 'Invalid runtime "{0}".', this.runtime));
        }
    }
}
