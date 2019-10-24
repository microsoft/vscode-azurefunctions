/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ext, TemplateSource } from '../extensionVariables';
import { FuncVersion, getMajorVersion, isPreviewVersion } from '../FuncVersion';
import { feedUtils } from './feedUtils';

export namespace cliFeedUtils {
    const funcCliFeedUrl: string = 'https://aka.ms/V00v5v';
    const v1DefaultNodeVersion: string = '6.5.0';
    const defaultNodeVersion: string = '~10';

    interface ICliFeed {
        tags: {
            [tag: string]: ITag;
        };
        releases: {
            [version: string]: IRelease;
        };
    }

    export interface IRelease {
        templateApiZip: string;
        itemTemplates: string;
        projectTemplates: string;
        FUNCTIONS_EXTENSION_VERSION: string;
        nodeVersion: string;
    }

    interface ITag {
        release: string;
        displayName: string;
        hidden: boolean;
    }

    export async function getLatestVersion(version: FuncVersion): Promise<string> {
        const cliFeed: ICliFeed = await getCliFeed();

        const majorVersion: string = getMajorVersion(version);
        let tag: string = 'v' + majorVersion;
        if (isPreviewVersion(version)) {
            tag = tag + '-preview';
        } else if (ext.templateProvider.templateSource === TemplateSource.Staging) {
            tag = tag + '-prerelease';
        }

        return cliFeed.tags[tag].release;
    }

    export async function getRelease(templateVersion: string): Promise<IRelease> {
        const cliFeed: ICliFeed = await getCliFeed();
        return cliFeed.releases[templateVersion];
    }

    /**
     * Returns the app settings that should be used when creating or deploying to a Function App, based on version
     */
    export async function getAppSettings(version: FuncVersion): Promise<{ [key: string]: string }> {
        let funcVersion: string;
        let nodeVersion: string;

        try {
            const cliFeed: ICliFeed = await getCliFeed();
            const release: string = await getLatestVersion(version);
            funcVersion = cliFeed.releases[release].FUNCTIONS_EXTENSION_VERSION;
            nodeVersion = cliFeed.releases[release].nodeVersion;
        } catch {
            // ignore and use defaults
            funcVersion = version;
            nodeVersion = version === FuncVersion.v1 ? v1DefaultNodeVersion : defaultNodeVersion;
        }

        return {
            FUNCTIONS_EXTENSION_VERSION: funcVersion,
            WEBSITE_NODE_DEFAULT_VERSION: nodeVersion
        };
    }

    async function getCliFeed(): Promise<ICliFeed> {
        return feedUtils.getJsonFeed(funcCliFeedUrl);
    }
}
