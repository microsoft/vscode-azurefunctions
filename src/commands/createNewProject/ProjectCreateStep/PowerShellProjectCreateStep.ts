/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtPipelineResponse } from '@microsoft/vscode-azext-azureutils';
import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type Progress } from 'vscode';
import { workerRuntimeVersionKey } from '../../../constants';
import { type IHostJsonV2 } from '../../../funcConfig/host';
import { hasMinFuncCliVersion } from '../../../funcCoreTools/hasMinFuncCliVersion';
import { localize } from '../../../localize';
import { confirmOverwriteFile } from "../../../utils/fs";
import { requestUtils } from '../../../utils/requestUtils';
import { type IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

const profileps1FileName: string = 'profile.ps1';
const requirementspsd1FileName: string = 'requirements.psd1';
const profileps1: string = `# Azure Functions profile.ps1
#
# This profile.ps1 will get executed every "cold start" of your Function App.
# "cold start" occurs when:
#
# * A Function App starts up for the very first time
# * A Function App starts up after being de-allocated due to inactivity
#
# You can define helper functions, run commands, or specify environment variables
# NOTE: any variables defined that are not environment variables will get reset after the first execution

# Authenticate with Azure PowerShell using MSI.
# Remove this if you are not planning on using MSI or Azure PowerShell.
if ($env:MSI_SECRET) {
    Disable-AzContextAutosave -Scope Process | Out-Null
    Connect-AzAccount -Identity
}

# Uncomment the next line to enable legacy AzureRm alias in Azure PowerShell.
# Enable-AzureRmAlias

# You can also define functions or aliases that can be referenced in any of your PowerShell functions.
`;

function requirementspsd1Online(majorVersion: number): string {
    return `# This file enables modules to be automatically managed by the Functions service.
# See https://aka.ms/functionsmanageddependency for additional information.
#
@{
    # For latest supported version, go to 'https://www.powershellgallery.com/packages/Az'.
    # To use the Az module in your function app, please uncomment the line below.
    # 'Az' = '${majorVersion}.*'
}`;
}

const requirementspsd1Offine: string = `# This file enables modules to be automatically managed by the Functions service.
# See https://aka.ms/functionsmanageddependency for additional information.
#
@{
    # For latest supported version, go to 'https://www.powershellgallery.com/packages/Az'. Uncomment the next line and replace the MAJOR_VERSION, e.g., 'Az' = '5.*'
    # 'Az' = 'MAJOR_VERSION.*'
}`;

export class PowerShellProjectCreateStep extends ScriptProjectCreateStep {
    private readonly azModuleName: string = 'Az';
    private readonly azModuleGalleryUrl: string = `https://aka.ms/PwshPackageInfo?id='${this.azModuleName}'`;

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (await hasMinFuncCliVersion(context, '3.0.2534', context.version)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.localSettingsJson.Values![workerRuntimeVersionKey] = '7.4';
        }

        await super.executeCore(context, progress);

        const profileps1Path: string = path.join(context.projectPath, profileps1FileName);
        if (await confirmOverwriteFile(context, profileps1Path)) {
            await AzExtFsExtra.writeFile(profileps1Path, profileps1);
        }

        const majorVersion: number | undefined = await this.tryGetLatestAzModuleMajorVersion(context, progress);
        if (majorVersion !== undefined) {
            progress.report({
                message: localize('successfullyConnected', 'Successfully retrieved {0} information from PowerShell Gallery', this.azModuleName)
            });
        } else {
            progress.report({
                message: localize('failedToConnect', 'Failed to get {0} module version. Edit the requirements.psd1 file when the powershellgallery.com is accessible.', this.azModuleName)
            });
        }

        const requirementspsd1Path: string = path.join(context.projectPath, requirementspsd1FileName);
        if (await confirmOverwriteFile(context, requirementspsd1Path)) {
            if (majorVersion !== undefined) {
                await AzExtFsExtra.writeFile(requirementspsd1Path, requirementspsd1Online(majorVersion));
            } else {
                await AzExtFsExtra.writeFile(requirementspsd1Path, requirementspsd1Offine);
            }
        }
    }

    protected async getHostContent(context: IProjectWizardContext): Promise<IHostJsonV2> {
        const hostJson: IHostJsonV2 = await super.getHostContent(context);
        hostJson.managedDependency = { enabled: true };
        return hostJson;
    }

    private async tryGetLatestAzModuleMajorVersion(context: IActionContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<number | undefined> {
        progress.report({
            message: localize('connecting', 'Connecting to PowerShell Gallery...')
        });

        try {
            const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: this.azModuleGalleryUrl });
            const versionResult: string = this.parseLatestAzModuleVersion(response);
            const [major]: string[] = versionResult.split('.');
            return parseInt(major);
        } catch {
            return undefined;
        }
    }

    private parseLatestAzModuleVersion(response: AzExtPipelineResponse): string {
        /* eslint-disable */
        const moduleInfo: any = response.parsedBody;
        if (moduleInfo?.entry && Array.isArray(moduleInfo.entry)) {
            const releasedVersions: string[] = moduleInfo.entry
                .filter(entry => entry['m:properties']['d:IsPrerelease']._ === 'false')
                .map(entry => entry['m:properties']['d:Version']);
            /* eslint-enable */

            // Select the latest version
            if (releasedVersions.length > 0) {
                const lastIndex: number = releasedVersions.length - 1;
                return releasedVersions[lastIndex];
            }
        }

        // If no version is found, throw exception
        throw new Error(`Failed to parse latest Az module version ${response.bodyAsText}`);
    }
}
