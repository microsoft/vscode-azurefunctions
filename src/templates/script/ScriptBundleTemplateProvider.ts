/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { hostFileName } from '../../constants';
import { parseHostJson, type IBundleMetadata } from '../../funcConfig/host';
import { localize } from '../../localize';
import { bundleFeedUtils } from '../../utils/bundleFeedUtils';
import { feedUtils } from '../../utils/feedUtils';
import { type IBindingTemplate } from '../IBindingTemplate';
import { type IFunctionTemplate } from '../IFunctionTemplate';
import { type ITemplates } from '../ITemplates';
import { TemplateSchemaVersion, TemplateType } from '../TemplateProviderBase';
import { ScriptTemplateProvider } from './ScriptTemplateProvider';
import { parseScriptTemplates } from './parseScriptTemplates';

export class ScriptBundleTemplateProvider extends ScriptTemplateProvider {
    public templateType: TemplateType = TemplateType.ScriptBundle;
    public templateSchemaVersion: TemplateSchemaVersion = TemplateSchemaVersion.v1;

    protected get backupSubpath(): string {
        return bundleFeedUtils.defaultBundleId;
    }

    public async getLatestTemplateVersion(context: IActionContext): Promise<string> {
        const bundleMetadata: IBundleMetadata | undefined = await this.getBundleInfo();
        return await bundleFeedUtils.getLatestTemplateVersion(context, bundleMetadata);
    }

    public async getLatestTemplates(context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        const bundleMetadata: IBundleMetadata | undefined = await this.getBundleInfo();
        const release: bundleFeedUtils.ITemplatesReleaseV1 = await bundleFeedUtils.getRelease(context, bundleMetadata, latestTemplateVersion);

        const language: string = this.getResourcesLanguage();
        const resourcesUrl: string = release.resources.replace('{locale}', language);

        const urls: string[] = [release.bindings, resourcesUrl, release.functions];
        [this._rawBindings, this._rawResources, this._rawTemplates] = <[object, object, object[]]>await Promise.all(urls.map(url => feedUtils.getJsonFeed(context, url)));

        return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawBindings);
    }

    public includeTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        return bundleFeedUtils.isBundleTemplate(template);
    }

    public async getBackupTemplates(): Promise<ITemplates> {
        const bundleMetadata: IBundleMetadata | undefined = await this.getBundleInfo();
        if (!bundleMetadata || !bundleMetadata.id || bundleMetadata.id === bundleFeedUtils.defaultBundleId) {
            return await super.getBackupTemplates();
        } else {
            throw new Error(localize('noBundleBackup', 'Backup templates are not supported for bundle "{0}".', bundleMetadata.id));
        }
    }

    protected async getCacheKeySuffix(): Promise<string> {
        const bundleMetadata: IBundleMetadata | undefined = await this.getBundleInfo();
        return bundleMetadata && bundleMetadata.id || bundleFeedUtils.defaultBundleId;
    }

    protected async getBundleInfo(): Promise<IBundleMetadata | undefined> {
        let data: unknown;
        if (this.projectPath) {
            const hostJsonPath: string = path.join(this.projectPath, hostFileName);
            if (await AzExtFsExtra.pathExists(hostJsonPath)) {
                try {
                    data = await AzExtFsExtra.readJSON(hostJsonPath);
                } catch (error) {
                    throw new Error(localize('failedToParseHostJson', 'Failed to parse host.json: "{0}"', parseError(error).message));
                }
            }
        }

        return parseHostJson(data, this.version).bundle;
    }
}
