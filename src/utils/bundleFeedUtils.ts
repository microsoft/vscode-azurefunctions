/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { ext, TemplateSource } from '../extensionVariables';
import { IBundleMetadata, IHostJsonV2 } from '../funcConfig/host';
import { localize } from '../localize';
import { FunctionV2Template } from '../templates/FunctionV2Template';
import { IBindingTemplate } from '../templates/IBindingTemplate';
import { IFunctionTemplate } from '../templates/IFunctionTemplate';
import { TemplateSchemaVersion } from '../templates/script/parseScriptTemplatesV2';
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
        // it is not supposed to exist in the v2 schema, but sometimes userPrompts accidentally gets replaced with bindings
        bindings?: string;
    }

    export async function getLatestTemplateVersion(context: IActionContext, bundleMetadata: IBundleMetadata | undefined, templateSchemaVersion: TemplateSchemaVersion = 'v1'): Promise<string> {
        bundleMetadata = bundleMetadata || {};

        const feed: IBundleFeed = await getBundleFeed(context, bundleMetadata);
        const validVersions: string[] = Object.keys(feed.templates[templateSchemaVersion]).filter((v: string) => !!semver.valid(v));
        const bundleVersion: string | undefined = nugetUtils.tryGetMaxInRange(bundleMetadata.version || await getLatestVersionRange(context), validVersions);
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

    export function isBundleTemplate(template: IFunctionTemplate | IBindingTemplate | FunctionV2Template): boolean {
        const bundleTemplateTypes: string[] = ['durable', 'signalr'];
        // I don't think v2 templates are ever a bundle template? Will have to verify this
        if (isFunctionV2Template(template)) {
            return true;
        }

        return (!template.isHttpTrigger && !template.isTimerTrigger) || bundleTemplateTypes.some(t => isTemplateOfType(template, t));
    }

    export function isFunctionV2Template(template: IFunctionTemplate | IBindingTemplate | FunctionV2Template): template is FunctionV2Template {
        if ('programmingModel' in template) {
            return template.programmingModel === 'v2';
        }

        return false;
    }

    export async function getLatestVersionRange(_context: IActionContext): Promise<string> {
        // const feed: IBundleFeed = await getBundleFeed(context, undefined);
        // return feed.defaultVersionRange;
        // New default bundle version causes issues (ex: https://github.com/microsoft/vscode-azurefunctions/issues/3711)
        // Using old version range as seen in https://github.com/Azure/azure-functions-host/pull/9324
        return '[3.*, 4.0.0)';
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

        return feedUtils.getJsonFeed(context, url);
    }

    export function overwriteExtensionBundleVersion(hostJson: IHostJsonV2, expectedRange: string, newRange: string): void {
        if (hostJson.extensionBundle && hostJson.extensionBundle.version === expectedRange) {
            hostJson.extensionBundle.version = newRange;
        }
    }
}
