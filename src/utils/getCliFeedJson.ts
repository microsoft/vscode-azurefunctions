/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';

const funcCliFeedUrl: string = 'https://aka.ms/V00v5v';

export type cliFeedJsonResponse = {
    tags: {
        [tag: string]: {
            release: string,
            displayName: string,
            hidden: boolean
        }
    },
    releases: {
        [release: string]: {
            templateApiZip: string,
            itemTemplates: string,
            projectTemplates: string,
            FUNCTIONS_EXTENSION_VERSION: string,
            nodeVersion: string
        }
    }
};

export async function tryGetCliFeedJson(): Promise<cliFeedJsonResponse | undefined> {
    // tslint:disable-next-line:no-unsafe-any
    return await callWithTelemetryAndErrorHandling('azureFunctions.tryGetCliFeedJson', async function (this: IActionContext): Promise<cliFeedJsonResponse> {
        this.properties.isActivationEvent = 'true';
        this.suppressErrorDisplay = true;
        const funcJsonOptions: request.OptionsWithUri = {
            method: 'GET',
            uri: funcCliFeedUrl
        };
        return <cliFeedJsonResponse>JSON.parse(await <Thenable<string>>request(funcJsonOptions).promise());
    });
}

export function getFeedRuntime(runtime: ProjectRuntime): string {
    switch (runtime) {
        case ProjectRuntime.beta:
            return 'v2';
        case ProjectRuntime.one:
            return 'v1';
        default:
            throw new RangeError();
    }
}

/**
 * Returns the app settings that should be used when creating or deploying to a Function App, based on runtime
 */
export async function getCliFeedAppSettings(projectRuntime: ProjectRuntime): Promise<{ [key: string]: string }> {
    // Use these defaults in case we can't get the cli-feed
    let funcVersion: string = projectRuntime;
    let nodeVersion: string = projectRuntime === ProjectRuntime.one ? '6.5.0' : '8.11.1';

    const cliFeed: cliFeedJsonResponse | undefined = await tryGetCliFeedJson();
    if (cliFeed) {
        const release: string = cliFeed.tags[getFeedRuntime(projectRuntime)].release;
        funcVersion = cliFeed.releases[release].FUNCTIONS_EXTENSION_VERSION;
        nodeVersion = cliFeed.releases[release].nodeVersion;
    }

    return {
        FUNCTIONS_EXTENSION_VERSION: funcVersion,
        WEBSITE_NODE_DEFAULT_VERSION: nodeVersion
    };
}
