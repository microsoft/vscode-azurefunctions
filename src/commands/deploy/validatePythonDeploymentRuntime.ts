/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type SiteConfigResource } from '@azure/arm-appservice';
import { ProjectLanguage } from '../../constants';
import { localize } from '../../localize';

export function validatePythonDeploymentRuntime(language: ProjectLanguage, siteConfig: SiteConfigResource, site: Site): void {
    if (language !== ProjectLanguage.Python) {
        return;
    }

    const isPython315 = siteConfig.linuxFxVersion?.toLowerCase() === 'python|3.15' ||
        (site.functionAppConfig?.runtime?.name?.toLowerCase() === 'python' && site.functionAppConfig.runtime.version === '3.15');
    if (isPython315) {
        throw new Error(localize('python315DeploymentNotSupported', 'Deployment to Python 3.15 Function Apps is not supported yet. Choose a supported Python version for your Function App.'));
    }
}
