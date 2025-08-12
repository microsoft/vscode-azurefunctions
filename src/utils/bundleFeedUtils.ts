/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { type IBundleMetadata, type IHostJsonV2 } from '../funcConfig/host';
import { localize } from '../localize';
import { type IBindingTemplate } from '../templates/IBindingTemplate';
import { type FunctionTemplateBase, type IFunctionTemplate } from '../templates/IFunctionTemplate';
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
                [templateVersion: string]: ITemplatesReleaseV1;
            };
            v2: { // This is the feed's internal schema version, aka _not_ the runtime version
                [templateVersion: string]: ITemplatesReleaseV2;
            };
        };
    }

    export interface ITemplatesReleaseBase {
        functions: string;
        resources: string;
    }

    export interface ITemplatesReleaseV1 extends ITemplatesReleaseBase {
        bindings: string;
    }

    export interface ITemplatesReleaseV2 extends ITemplatesReleaseBase {
        userPrompts: string;
        // for v3 runtimes, it still uses bindings for user prompts
        bindings?: string;
    }

    export async function getLatestTemplateVersion(context: IActionContext, bundleMetadata: IBundleMetadata | undefined): Promise<string> {
        bundleMetadata = bundleMetadata || {};
        const versionArray: string[] = await feedUtils.getJsonFeed(context, 'https://aka.ms/azFuncBundleVersions');
        const validVersions: string[] = versionArray.filter((v: string) => !!semver.valid(v));
        const bundleVersion: string | undefined = nugetUtils.tryGetMaxInRange(bundleMetadata.version || await getLatestVersionRange(context), validVersions);
        if (!bundleVersion) {
            throw new Error(localize('failedToFindBundleVersion', 'Failed to find bundle version satisfying range "{0}".', bundleMetadata.version));
        } else {
            return bundleVersion;
        }
    }

    export async function getRelease(templateVersion: string, version: 'v1' | 'v2'): Promise<ITemplatesReleaseV1 | ITemplatesReleaseV2> {
        // build the url ourselves because the index-v2.json file is no longer publishing version updates
        const functionsCdn: string = 'https://cdn.functions.azure.com/public/ExtensionBundles/Microsoft.Azure.Functions.ExtensionBundle/';
        if (version === 'v1') {
            return {
                functions: `${functionsCdn}${templateVersion}/StaticContent/v1/templates/templates.json`,
                bindings: `${functionsCdn}${templateVersion}/StaticContent/v1/bindings/bindings.json`,
                resources: `${functionsCdn}${templateVersion}/StaticContent/v1/resources/Resources.{locale}.json`,
            };
        }

        return {
            functions: `${functionsCdn}${templateVersion}/StaticContent/v2/templates/templates.json`,
            bindings: `${functionsCdn}${templateVersion}/StaticContent/v2/bindings/userPrompts.json`,
            userPrompts: `${functionsCdn}${templateVersion}/StaticContent/v2/bindings/userPrompts.json`,
            resources: `${functionsCdn}${templateVersion}/StaticContent/v2/resources/Resources.{locale}.json`,
        }
    }

    export function isBundleTemplate(template: FunctionTemplateBase | IBindingTemplate): boolean {
        const bundleTemplateTypes: string[] = ['durable', 'signalr'];
        return (!template.isHttpTrigger && !template.isTimerTrigger) || bundleTemplateTypes.some(t => isTemplateOfType(template, t));
    }

    export async function getLatestVersionRange(context: IActionContext): Promise<string> {
        const feed: IBundleFeed = await getBundleFeed(context);
        return feed.defaultVersionRange;
    }

    export async function addDefaultBundle(context: IActionContext, hostJson: IHostJsonV2): Promise<void> {
        let versionRange: string;
        try {
            versionRange = (await getLatestVersionRange(context)) ?? defaultVersionRange;
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

    async function getBundleFeed(context: IActionContext): Promise<IBundleFeed> {
        const url: string = 'https://aka.ms/funcStaticProperties';
        return feedUtils.getJsonFeed(context, url);
    }

    export function overwriteExtensionBundleVersion(hostJson: IHostJsonV2, expectedRange: string, newRange: string): void {
        if (hostJson.extensionBundle && hostJson.extensionBundle.version === expectedRange) {
            hostJson.extensionBundle.version = newRange;
        }
    }
}
