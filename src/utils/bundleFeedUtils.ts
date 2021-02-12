/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { ext, TemplateSource } from '../extensionVariables';
import { IBundleMetadata, IHostJsonV2 } from '../funcConfig/host';
import { localize } from '../localize';
import { IBindingTemplate } from '../templates/IBindingTemplate';
import { IFunctionTemplate } from '../templates/IFunctionTemplate';
import { feedUtils } from './feedUtils';
import { nugetUtils } from './nugetUtils';

export namespace bundleFeedUtils {
    export const defaultBundleId: string = 'Microsoft.Azure.Functions.ExtensionBundle';
    export const defaultVersionRange: string = '[1.*, 2.0.0)';

    interface IBundleFeed {
        defaultVersionRange: string;
        bundleVersions: {
            [bundleVersion: string]: {
                templates: string;
            };
        };
        templates: {
            v1: { // This is the feed's internal schema version, aka _not_ the runtime version
                [templateVersion: string]: ITemplatesRelease;
            };
        };
    }

    export interface ITemplatesRelease {
        functions: string;
        bindings: string;
        resources: string;
    }

    export async function getLatestTemplateVersion(bundleMetadata: IBundleMetadata | undefined): Promise<string> {
        bundleMetadata = bundleMetadata || {};

        const feed: IBundleFeed = await getBundleFeed(bundleMetadata);
        const validVersions: string[] = Object.keys(feed.bundleVersions).filter((v: string) => !!semver.valid(v));
        const bundleVersion: string | undefined = nugetUtils.tryGetMaxInRange(bundleMetadata.version || feed.defaultVersionRange, validVersions);
        if (!bundleVersion) {
            throw new Error(localize('failedToFindBundleVersion', 'Failed to find bundle version satisfying range "{0}".', bundleMetadata.version));
        } else {
            return feed.bundleVersions[bundleVersion].templates;
        }
    }

    export async function getRelease(bundleMetadata: IBundleMetadata | undefined, templateVersion: string): Promise<ITemplatesRelease> {
        const feed: IBundleFeed = await getBundleFeed(bundleMetadata);
        return feed.templates.v1[templateVersion];
    }

    export function isBundleTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        const bundleTemplateTypes: string[] = ['durable', 'signalr'];
        return (!template.isHttpTrigger && !template.isTimerTrigger) || bundleTemplateTypes.some(t => isTemplateOfType(template, t));
    }

    export async function getLatestVersionRange(): Promise<string> {
        const feed: IBundleFeed = await getBundleFeed(undefined);
        return feed.defaultVersionRange;
    }

    export async function addDefaultBundle(hostJson: IHostJsonV2): Promise<void> {
        let versionRange: string;
        try {
            versionRange = await getLatestVersionRange();
        } catch {
            versionRange = defaultVersionRange;
        }

        hostJson.extensionBundle = {
            id: defaultBundleId,
            version: versionRange
        };
    }

    function isTemplateOfType(template: Partial<IFunctionTemplate>, templateType: string): boolean {
        return !!template.id?.toLowerCase().includes(templateType.toLowerCase());
    }

    async function getBundleFeed(bundleMetadata: IBundleMetadata | undefined): Promise<IBundleFeed> {
        const bundleId: string = bundleMetadata && bundleMetadata.id || defaultBundleId;

        const envVarUri: string | undefined = process.env.FUNCTIONS_EXTENSIONBUNDLE_SOURCE_URI;
        // Only use an aka.ms link for the most common case, otherwise we will dynamically construct the url
        let url: string;
        if (!envVarUri && bundleId === defaultBundleId && ext.templateProvider.templateSource !== TemplateSource.Staging) {
            url = 'https://aka.ms/AA66i2x';
        } else {
            const suffix: string = ext.templateProvider.templateSource === TemplateSource.Staging ? 'staging' : '';
            const baseUrl: string = envVarUri || `https://functionscdn${suffix}.azureedge.net/public`;
            url = `${baseUrl}/ExtensionBundles/${bundleId}/index-v2.json`;
        }

        return feedUtils.getJsonFeed(url);
    }
}
