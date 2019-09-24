/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext, parseError } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cliFeedJsonResponse } from '../utils/getCliFeedJson';
import { IFunctionTemplate } from './IFunctionTemplate';

const v2BackupTemplatesVersion: string = '2.18.1';
const v1BackupTemplatesVersion: string = '1.8.0';

export enum TemplateType {
    Script = 'Script',
    Dotnet = '.NET'
}

export abstract class TemplateRetriever {
    public static templateVersionKey: string = 'templateVersion';
    public abstract templateType: TemplateType;

    public async tryGetTemplatesFromCache(context: IActionContext, runtime: ProjectRuntime): Promise<IFunctionTemplate[] | undefined> {
        try {
            return await this.getTemplatesFromCache(runtime);
        } catch (error) {
            const errorMessage: string = parseError(error).message;
            ext.outputChannel.appendLog(errorMessage);
            context.telemetry.properties.cacheError = errorMessage;
            return undefined;
        }
    }

    public async tryGetTemplatesFromCliFeed(context: IActionContext, cliFeedJson: cliFeedJsonResponse, templateVersion: string, runtime: ProjectRuntime): Promise<IFunctionTemplate[] | undefined> {
        try {
            context.telemetry.properties.templateVersion = templateVersion;
            ext.outputChannel.appendLog(localize('updatingTemplates', 'Updating {0} templates for runtime "{1}" to version "{2}"...', this.templateType, runtime, templateVersion));
            const templates: IFunctionTemplate[] = await this.getTemplatesFromCliFeed(cliFeedJson, templateVersion, runtime, context);
            ext.context.globalState.update(this.getCacheKey(TemplateRetriever.templateVersionKey, runtime), templateVersion);
            await this.cacheTemplates(runtime);
            ext.outputChannel.appendLog(localize('updatedTemplates', 'Successfully updated templates.'));
            return templates;
        } catch (error) {
            const errorMessage: string = parseError(error).message;
            ext.outputChannel.appendLog(errorMessage);
            context.telemetry.properties.cliFeedError = errorMessage;
            return undefined;
        }
    }

    public async tryGetTemplatesFromBackup(context: IActionContext, runtime: ProjectRuntime): Promise<IFunctionTemplate[] | undefined> {
        try {
            const backupTemplateVersion: string = this.getBackupVersion(runtime);
            const templates: IFunctionTemplate[] = await this.getTemplatesFromBackup(runtime);
            ext.context.globalState.update(this.getCacheKey(TemplateRetriever.templateVersionKey, runtime), backupTemplateVersion);
            await this.cacheTemplates(runtime);
            ext.outputChannel.appendLog(localize('usingBackupTemplates', 'Falling back to version "{0}" for {1} templates for runtime "{2}".', backupTemplateVersion, this.templateType, runtime));
            return templates;
        } catch (error) {
            const errorMessage: string = parseError(error).message;
            ext.outputChannel.appendLog(errorMessage);
            context.telemetry.properties.backupError = errorMessage;
            return undefined;
        }
    }

    /**
     * Adds runtime, templateType, and language information to a key to ensure there are no collisions in the cache
     * For backwards compatability, the original runtime, templateType, and language will not have this information
     */
    public getCacheKey(key: string, runtime: ProjectRuntime): string {
        if (runtime !== ProjectRuntime.v1) {
            key = `${key}.${runtime}`;
        }

        if (this.templateType !== TemplateType.Script) {
            key = `${key}.${this.templateType}`;
        }

        if (vscode.env.language && !/^en(-us)?$/i.test(vscode.env.language)) {
            key = `${key}.${vscode.env.language}`;
        }

        return key;
    }

    protected abstract getTemplatesFromCache(runtime: ProjectRuntime): Promise<IFunctionTemplate[] | undefined>;
    protected abstract getTemplatesFromCliFeed(cliFeedJson: cliFeedJsonResponse, templateVersion: string, runtime: ProjectRuntime, context: IActionContext): Promise<IFunctionTemplate[]>;
    protected abstract getTemplatesFromBackup(runtime: ProjectRuntime): Promise<IFunctionTemplate[]>;
    protected abstract cacheTemplates(runtime: ProjectRuntime): Promise<void>;

    protected getBackupVersion(runtime: ProjectRuntime): string {
        switch (runtime) {
            case ProjectRuntime.v1:
                return v1BackupTemplatesVersion;
            case ProjectRuntime.v2:
                return v2BackupTemplatesVersion;
            default:
                throw new RangeError(localize('invalidRuntime', 'Invalid runtime "{0}".', runtime));
        }
    }
}
