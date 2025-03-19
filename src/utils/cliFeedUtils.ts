/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { ext, TemplateSource } from '../extensionVariables';
import { getMajorVersion, type FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { feedUtils } from './feedUtils';

export namespace cliFeedUtils {
    const funcCliFeedV4Url: string = 'https://aka.ms/funcCliFeedV4';

    interface ICliFeed {
        tags: {
            [tag: string]: ITag | undefined;
        };
        releases: {
            [version: string]: IRelease;
        };
    }

    export interface IRelease {
        templates: string;
        workerRuntimes: {
            dotnet: {
                [key: string]: IWorkerRuntime
            }
        };
    }

    interface ITag {
        release: string;
    }

    export interface IWorkerRuntime {
        displayInfo: {
            displayName: string;
            description?: string;
            hidden: boolean;
        },
        sdk: {
            name: string;
        }
        targetFramework: string;
        itemTemplates: string;
        projectTemplates: string;
        projectTemplateId: {
            csharp: string;
        },
        capabilities: string;
    }

    export async function getLatestVersion(context: IActionContext, version: FuncVersion): Promise<string> {
        const majorVersion: string = getMajorVersion(version);
        return await getLatestReleaseVersionForMajorVersion(context, majorVersion);
    }

    export async function getLatestReleaseVersionForMajorVersion(context: IActionContext, majorVersion: string): Promise<string> {
        const cliFeed: ICliFeed = await getCliFeed(context);
        let tag: string = 'v' + majorVersion;
        const templateProvider = ext.templateProvider.get(context);
        if (templateProvider.templateSource === TemplateSource.Staging) {
            const newTag = tag + '-prerelease';
            if (cliFeed.tags[newTag]) {
                tag = newTag;
            } else {
                ext.outputChannel.appendLog(localize('versionWithoutStaging', 'WARNING: Azure Functions v{0} does not support the staging template source. Using default template source instead.', majorVersion))
            }
        }

        const releaseData = cliFeed.tags[tag];
        if (!releaseData) {
            throw new Error(localize('unsupportedVersion', 'Azure Functions v{0} does not support this operation.', majorVersion));
        }
        return releaseData.release;
    }

    export async function getSortedVersions(context: IActionContext, version: FuncVersion): Promise<string[]> {
        const cliFeed: ICliFeed = await getCliFeed(context);
        const majorVersion = parseInt(getMajorVersion(version));
        const versions = Object.keys(cliFeed.releases).filter(v => semver.valid(v) && semver.major(v) === majorVersion);
        return semver.rsort(versions).map(v => typeof v === 'string' ? v : v.version);
    }

    export async function getRelease(context: IActionContext, templateVersion: string): Promise<IRelease> {
        const cliFeed: ICliFeed = await getCliFeed(context);
        return cliFeed.releases[templateVersion];
    }

    async function getCliFeed(context: IActionContext): Promise<ICliFeed> {
        return feedUtils.getJsonFeed(context, funcCliFeedV4Url);
    }
}
