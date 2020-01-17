/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ext, TemplateSource } from '../extensionVariables';
import { FuncVersion, getMajorVersion, isPreviewVersion } from '../FuncVersion';
import { feedUtils } from './feedUtils';

export namespace cliFeedUtils {
    const funcCliFeedUrl: string = 'https://aka.ms/V00v5v';

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

    async function getCliFeed(): Promise<ICliFeed> {
        return feedUtils.getJsonFeed(funcCliFeedUrl);
    }
}
