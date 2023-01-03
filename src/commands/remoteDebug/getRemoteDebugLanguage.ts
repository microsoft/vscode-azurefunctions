/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteConfig } from '@azure/arm-appservice';
import { RemoteDebugLanguage } from '@microsoft/vscode-azext-azureappservice';

export function getRemoteDebugLanguage(siteConfig: SiteConfig, appServicePlan?: string): RemoteDebugLanguage {
    // Read siteConfig.linuxFxVersion to determine debugging support
    //   If the Function App is running on Windows, it will be empty
    //   If the Function App is running on Linux consumption plan remote debugging is not supported
    //   If the Function App is running on a Linux App Service plan, it will contain Docker registry information, e.g. "DOCKER|repo.azurecr.io/image:tag"
    //      or it will contain language information, e.g. "Node|14"
    const isNotConsumption: boolean = appServicePlan?.toLowerCase() !== 'y';
    if (isNotConsumption) {
        if (siteConfig.linuxFxVersion && (/^(DOCKER\|(mcr\.microsoft\.com)\/(azure-functions)\/(node)|Node\|)/i).test(siteConfig.linuxFxVersion)) {
            return RemoteDebugLanguage.Node;
        }
    }


    throw new Error('Azure Remote Debugging is currently only supported for Node.js Function Apps running on Linux App Service plans. Consumption plans are not supported.');
}
