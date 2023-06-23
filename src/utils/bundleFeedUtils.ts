/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
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
                templatesV2: string
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
    }

    export async function getLatestTemplateVersion(context: IActionContext, bundleMetadata: IBundleMetadata | undefined): Promise<string> {
        bundleMetadata = bundleMetadata || {};

        const feed: IBundleFeed = await getBundleFeed(context, bundleMetadata);
        const validVersions: string[] = Object.keys(feed.bundleVersions).filter((v: string) => !!semver.valid(v));
        const bundleVersion: string | undefined = nugetUtils.tryGetMaxInRange(bundleMetadata.version || feed.defaultVersionRange, validVersions);
        if (!bundleVersion) {
            throw new Error(localize('failedToFindBundleVersion', 'Failed to find bundle version satisfying range "{0}".', bundleMetadata.version));
        } else {
            return feed.bundleVersions[bundleVersion].templates;
        }
    }

    export async function getRelease(context: IActionContext, bundleMetadata: IBundleMetadata | undefined, templateVersion: string): Promise<ITemplatesReleaseV1> {
        const feed: IBundleFeed = await getBundleFeed(context, bundleMetadata);
        return feed.templates.v1[templateVersion];
    }

    export async function getReleaseV2(context: IActionContext, bundleMetadata: IBundleMetadata | undefined, templateVersion: string): Promise<ITemplatesReleaseV2> {
        const feed: IBundleFeed = await getBundleFeed(context, bundleMetadata);
        return feed.templates.v2[templateVersion];
    }

    export function isBundleTemplate(template: IFunctionTemplate | IBindingTemplate): boolean {
        const bundleTemplateTypes: string[] = ['durable', 'signalr'];
        return (!template.isHttpTrigger && !template.isTimerTrigger) || bundleTemplateTypes.some(t => isTemplateOfType(template, t));
    }

    export async function getLatestVersionRange(context: IActionContext): Promise<string> {
        const feed: IBundleFeed = await getBundleFeed(context, undefined);
        return feed.defaultVersionRange;
    }

    export async function addDefaultBundle(context: IActionContext, hostJson: IHostJsonV2): Promise<void> {
        let versionRange: string;
        try {
            versionRange = await getLatestVersionRange(context);
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

    async function getBundleFeed(context: IActionContext, bundleMetadata: IBundleMetadata | undefined): Promise<IBundleFeed> {
        const bundleId: string = bundleMetadata && bundleMetadata.id || defaultBundleId;

        const envVarUri: string | undefined = process.env.FUNCTIONS_EXTENSIONBUNDLE_SOURCE_URI;
        // Only use an aka.ms link for the most common case, otherwise we will dynamically construct the url
        let url: string;
        const templateProvider = ext.templateProvider.get(context);
        if (!envVarUri && bundleId === defaultBundleId && templateProvider.templateSource !== TemplateSource.Staging) {
            url = 'https://aka.ms/AA66i2x';
        } else {
            const suffix: string = templateProvider.templateSource === TemplateSource.Staging ? 'staging' : '';
            const baseUrl: string = envVarUri || `https://functionscdn${suffix}.azureedge.net/public`;
            url = `${baseUrl}/ExtensionBundles/${bundleId}/index-v2.json`;
        }

        // TODO: Get the bundlefeed properly-- waiting on deployment of V2 templates
        const bundleFeed = await feedUtils.getJsonFeed(context, url) as IBundleFeed;
        /** V2-SCHEMA: Here, the parsed body should look like:
            * { templates: {
            * v1: {},
            * v2: {
            * 1.0.0: {
            *   ├── Schemas
                │   ├── action-schemas.json
                │   └── template-schema.json
                ├── Bindings
                │   └── userPrompts.json
                ├── Templates-V2
                │   └── TimerTrigger-Python
                │       ├── function_app.py
                │       ├── function_body.py
                │       ├── template.json
                │       └── timer_trigger_template.md
            *}
        **/

        // TESTING CODE FOR V2-SCHEMA
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        bundleFeed.bundleVersions['1.0.0'].templatesV2 = "1.0.0";
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        bundleFeed.templates.v2 = {
            '1.0.0': {
                resources: "https://nasoniwinconsum89a4.blob.core.windows.net/public/ExtensionBundles/Microsoft.Azure.Functions.ExtensionBundle/3.22.0/StaticContent/v2/resources/Resources.json",
                userPrompts: "https://nasoniwinconsum89a4.blob.core.windows.net/public/ExtensionBundles/Microsoft.Azure.Functions.ExtensionBundle/3.18.0/StaticContent/v2/bindings/userPrompts.json",
                functions: "https://nasoniwinconsum89a4.blob.core.windows.net/public/ExtensionBundles/Microsoft.Azure.Functions.ExtensionBundle/3.18.0/StaticContent/v2/templates/templates.json"
            }
        };

        return bundleFeed;

        // return feedUtils.getJsonFeed(context, url);
    }

    export function overwriteExtensionBundleVersion(hostJson: IHostJsonV2, expectedRange: string, newRange: string): void {
        if (hostJson.extensionBundle && hostJson.extensionBundle.version === expectedRange) {
            hostJson.extensionBundle.version = newRange;
        }
    }
}
