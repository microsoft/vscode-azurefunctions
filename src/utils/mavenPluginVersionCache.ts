/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { FileSystemWatcher, Uri, workspace } from 'vscode';
import { mavenUtils } from './mavenUtils';

export interface IMavenPluginVersionCache {
    getPluginVersion(functionAppPath: string | undefined): string | null;
    init(): Promise<void>;
    dispose(): void;
}

class MavenPluginVersionCache implements IMavenPluginVersionCache {
    /**
     * versionMap caches the Maven Azure Functions plugin version numbers.
     * The key is the directory of the pom file.
     * The value stores the version number. If the value is null, means it's under resolving. If it's empty, means there is not plugin dependency in the pom.
     */
    private versionMap: Map<string, string | null>;
    private fileWatcher: FileSystemWatcher;

    constructor() {
        this.versionMap = new Map();
        this.fileWatcher = workspace.createFileSystemWatcher('**/pom.xml');
    }

    public async init(): Promise<void> {
        const pomFileUris: Uri[] = await workspace.findFiles('**/pom.xml');
        for (const pomFileUri of pomFileUris) {
            await this.resolvePluginVersion(pomFileUri);
        }

        this.fileWatcher.onDidChange(async (uri: Uri) => {
            await this.resolvePluginVersion(uri);
        });

        this.fileWatcher.onDidCreate(async (uri: Uri) => {
            await this.resolvePluginVersion(uri);
        });

        this.fileWatcher.onDidDelete((uri: Uri) => {
            this.versionMap.delete(path.dirname(uri.fsPath));
        });
    }

    public getPluginVersion(functionAppPath: string): string | null {
        const version: string | null | undefined = this.versionMap.get(functionAppPath);
        if (version === undefined) {
            return '';
        }
        return version;
    }

    public dispose(): void {
        this.fileWatcher.dispose();
    }

    private async resolvePluginVersion(pomFileUri: Uri): Promise<void> {
        const pomDirectory: string = path.dirname(pomFileUri.fsPath);
        this.versionMap.set(pomDirectory, null);
        this.versionMap.set(pomDirectory, await mavenUtils.getFunctionPluginVersion(undefined, pomDirectory));
    }
}

export const mavenPluginVersionCache: IMavenPluginVersionCache = new MavenPluginVersionCache();
