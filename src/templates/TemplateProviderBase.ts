/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { localize } from '../localize';
import { cliFeedJsonResponse } from '../utils/getCliFeedJson';
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

    public constructor(runtime: ProjectRuntime) {
        this.runtime = runtime;
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

    public abstract getCachedTemplates(): Promise<ITemplates | undefined>;
    public abstract getLatestTemplates(cliFeedJson: cliFeedJsonResponse, templateVersion: string, context: IActionContext): Promise<ITemplates>;
    public abstract getBackupTemplates(): Promise<ITemplates>;
    public abstract cacheTemplates(): Promise<void>;

    public getBackupVersion(): string {
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
