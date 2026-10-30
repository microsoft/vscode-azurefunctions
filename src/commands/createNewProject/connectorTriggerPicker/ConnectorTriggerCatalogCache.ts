/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ext } from '../../../extensionVariables';
import { ProjectTemplateProvider } from '../../../templates/projectTemplates/ProjectTemplateProvider';
import { type ConnectorCatalogPublicSource } from './ConnectorTriggerCatalogProvider';

export interface ConnectorTriggerManifestResult {
    manifest: unknown;
    source: ConnectorCatalogPublicSource;
}

export interface IConnectorTriggerCatalogCache {
    getManifest(context: IActionContext): Promise<ConnectorTriggerManifestResult>;
    getBundledManifest(): Promise<unknown>;
}

/**
 * Reuses the project-template manifest's persistent remote cache and bundled fallback.
 * The in-memory promise prevents duplicate reads when the picker refreshes live data.
 */
export class ConnectorTriggerCatalogCache implements IConnectorTriggerCatalogCache {
    private manifestPromise: Promise<ConnectorTriggerManifestResult> | undefined;
    private bundledManifestPromise: Promise<unknown> | undefined;

    public constructor(
        private readonly templateProvider: Pick<ProjectTemplateProvider, 'getManifest'> =
            new ProjectTemplateProvider(),
        private readonly extensionPathProvider: () => string =
            () => ext.context.extensionPath,
    ) { }

    public async getManifest(
        context: IActionContext,
    ): Promise<ConnectorTriggerManifestResult> {
        const promise = this.manifestPromise ??= this.loadManifest(context);
        try {
            return await promise;
        } catch (error) {
            if (this.manifestPromise === promise) {
                this.manifestPromise = undefined;
            }
            throw error;
        }
    }

    public async getBundledManifest(): Promise<unknown> {
        const promise = this.bundledManifestPromise ??=
            this.loadBundledManifest();
        try {
            return await promise;
        } catch (error) {
            if (this.bundledManifestPromise === promise) {
                this.bundledManifestPromise = undefined;
            }
            throw error;
        }
    }

    private async loadManifest(
        context: IActionContext,
    ): Promise<ConnectorTriggerManifestResult> {
        const manifest = await this.templateProvider.getManifest(context);
        const manifestSource = context.telemetry.properties.manifestSource;
        const source: ConnectorCatalogPublicSource =
            manifestSource === 'bundled' ?
                'bundled' :
                manifestSource === 'cache' ?
                    'remoteCache' :
                    'remote';
        return { manifest, source };
    }

    private async loadBundledManifest(): Promise<unknown> {
        const bundledPath = path.join(
            this.extensionPathProvider(),
            'resources',
            'backupProjectTemplates',
            'manifest.json',
        );
        return JSON.parse(await AzExtFsExtra.readFile(bundledPath));
    }
}
