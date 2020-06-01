/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IActionContext, parseError } from 'vscode-azureextensionui';
import { hostFileName } from '../../constants';
import { IBundleMetadata, parseHostJson } from '../../funcConfig/host';
import { localize } from '../../localize';
import { bundleFeedUtils } from '../../utils/bundleFeedUtils';
import { parseJson } from '../../utils/parseJson';
import { requestUtils } from '../../utils/requestUtils';
import { IBindingTemplate } from '../IBindingTemplate';
import { IFunctionTemplate } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';
import { TemplateType } from '../TemplateProviderBase';
import { parseScriptTemplates } from './parseScriptTemplates';
import { ScriptTemplateProvider } from './ScriptTemplateProvider';

export class ScriptBundleTemplateProvider extends ScriptTemplateProvider {
    public templateType: TemplateType = TemplateType.ScriptBundle;

    protected get backupSubpath(): string {
        return bundleFeedUtils.defaultBundleId;
    }

    public async getLatestTemplateVersion(): Promise<string> {
        const bundleMetadata: IBundleMetadata | undefined = await this.getBundleInfo();
        return await bundleFeedUtils.getLatestTemplateVersion(bundleMetadata);
    }

    public async getLatestTemplates(_context: IActionContext, latestTemplateVersion: string): Promise<ITemplates> {
        const bundleMetadata: IBundleMetadata | undefined = await this.getBundleInfo();
        const release: bundleFeedUtils.ITemplatesRelease = await bundleFeedUtils.getRelease(bundleMetadata, latestTemplateVersion);

        const bindingsRequest: requestUtils.Request = await requestUtils.getDefaultRequestWithTimeout(release.bindings);

        const language: string = this.getResourcesLanguage();
        const resourcesUrl: string = release.resources.replace('{locale}', language);
        const resourcesRequest: requestUtils.Request = await requestUtils.getDefaultRequestWithTimeout(resourcesUrl);

        const templatesRequest: requestUtils.Request = await requestUtils.getDefaultRequestWithTimeout(release.functions);

        [this._rawBindings, this._rawResources, this._rawTemplates] = <[object, object, object[]]>(
            await Promise.all([bindingsRequest, resourcesRequest, templatesRequest].map(requestUtils.sendRequest))
        ).map(parseJson);

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

    private async getBundleInfo(): Promise<IBundleMetadata | undefined> {
        let data: unknown;
        if (this.projectPath) {
            const hostJsonPath: string = path.join(this.projectPath, hostFileName);
            if (await fse.pathExists(hostJsonPath)) {
                try {
                    data = await fse.readJSON(hostJsonPath);
                } catch (error) {
                    throw new Error(localize('failedToParseHostJson', 'Failed to parse host.json: "{0}"', parseError(error).message));
                }
            }
        }

        return parseHostJson(data, this.version).bundle;
    }
}
