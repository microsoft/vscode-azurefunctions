/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';

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
            templateApiZip: string
        }
    }
};

export async function tryGetCliFeedJson(): Promise<cliFeedJsonResponse | undefined> {
    try {
        // tslint:disable-next-line:no-unsafe-any
        return await callWithTelemetryAndErrorHandling('azureFunctions.tryGetCliFeedJson', ext.reporter, undefined, async function (this: IActionContext): Promise<cliFeedJsonResponse> {
            this.properties.isActivationEvent = 'true';
            this.suppressErrorDisplay = true;
            const funcJsonOptions: request.OptionsWithUri = {
                method: 'GET',
                uri: funcCliFeedUrl
            };
            return <cliFeedJsonResponse>JSON.parse(await <Thenable<string>>request(funcJsonOptions).promise());
        });

    } catch (error) {
        return undefined;
    }
}
