/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from 'vscode-azureextensionui';
import { ext, TemplateSource } from '../extensionVariables';
import { FuncVersion, getMajorVersion, isPreviewVersion } from '../FuncVersion';
import { feedUtils } from './feedUtils';

export namespace cliFeedUtils {
    const funcCliFeedV4Url: string = 'https://aka.ms/AAbbk68';

    interface ICliFeed {
        tags: {
            [tag: string]: ITag;
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
        }
    }

    export async function getLatestVersion(context: IActionContext, version: FuncVersion): Promise<string> {
        const cliFeed: ICliFeed = await getCliFeed();

        const majorVersion: string = getMajorVersion(version);
        let tag: string = 'v' + majorVersion;
        const templateProvider = ext.templateProvider.get(context);
        if (isPreviewVersion(version)) {
            tag = tag + '-preview';
        } else if (templateProvider.templateSource === TemplateSource.Staging) {
            tag = tag + '-prerelease';
        }

        return cliFeed.tags[tag].release;
    }

    export async function getRelease(templateVersion: string): Promise<IRelease> {
        const cliFeed: ICliFeed = await getCliFeed();
        return cliFeed.releases[templateVersion];
    }

    async function getCliFeed(): Promise<ICliFeed> {
        return feedUtils.getJsonFeed(funcCliFeedV4Url);
    }
}
