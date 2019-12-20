/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as retry from 'p-retry';
import * as path from 'path';
import { Progress } from 'vscode';
import * as xml2js from 'xml2js';
import { confirmOverwriteFile } from "../../../utils/fs";
import { requestUtils } from '../../../utils/requestUtils';
import { IProjectWizardContext } from '../IProjectWizardContext';
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
if ($env:MSI_SECRET -and (Get-Module -ListAvailable Az.Accounts)) {
    Connect-AzAccount -Identity
}

# Uncomment the next line to enable legacy AzureRm alias in Azure PowerShell.
# Enable-AzureRmAlias

# You can also define functions or aliases that can be referenced in any of your PowerShell functions.
`;

function requirementspsd1(majorVersion: number): string {
    return `# This file enables modules to be automatically managed by the Functions service.
# See https://aka.ms/functionsmanageddependency for additional information.
#
@{
    'Az' = '${majorVersion}.*'
}`;
}

const requirementspsd1Offine: string = `# This file enables modules to be automatically managed by the Functions service.
# See https://aka.ms/functionsmanageddependency for additional information.
#
@{
    # For latest supported version, go to 'https://www.powershellgallery.com/packages/Az'. Uncomment the next line and replace the MAJOR_VERSION, e.g., 'Az' = '3.*'
    # 'Az' = 'MAJOR_VERSION.*'
}`;

export class PowerShellProjectCreateStep extends ScriptProjectCreateStep {
    protected supportsManagedDependencies: boolean = true;

    private readonly numberOfRequestRetries: number = 3;
    private readonly requestTimeoutMs: number = 3 * 1000;

    private readonly azModuleName: string = 'Az';
    private readonly azModuleGalleryUrl: string = `https://www.powershellgallery.com/api/v2/FindPackagesById()?id='${this.azModuleName}'`;

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await super.executeCore(context, progress);

        const profileps1Path: string = path.join(context.projectPath, profileps1FileName);
        if (await confirmOverwriteFile(profileps1Path)) {
            await fse.writeFile(profileps1Path, profileps1);
        }

        const majorVersion: number | undefined = await this.getLatestAzModuleMajorVersion(progress);
        if (majorVersion !== undefined) {
            progress.report({
                message: `Successfully retrieved ${this.azModuleName} information from PowerShell Gallery"`
            });
        } else {
            progress.report({
                message: `Failed to get ${this.azModuleName} module version. Edit the requirements.psd1 file when the powershellgallery.com is accessible.`
            });
        }

        const requirementspsd1Path: string = path.join(context.projectPath, requirementspsd1FileName);
        if (await confirmOverwriteFile(requirementspsd1Path)) {
            if (majorVersion !== undefined) {
                await fse.writeFile(requirementspsd1Path, requirementspsd1(majorVersion));
            } else {
                await fse.writeFile(requirementspsd1Path, requirementspsd1Offine);
            }
        }
    }

    private async getLatestAzModuleMajorVersion(progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<number | undefined> {
        progress.report({
            message: 'Connecting to PowerShell Gallery...'
        });

        const xmlResult: string | undefined = await this.getPSGalleryAzModuleInfo();
        if (!xmlResult) {
            return undefined;
        }

        const versionResult: string | undefined = await this.parseLatestAzModuleVersion(xmlResult);
        if (!versionResult) {
            return undefined;
        }

        try {
            const [major]: string[] = versionResult.split('.');
            return parseInt(major);
        } catch {
            return undefined;
        }
    }

    private async getPSGalleryAzModuleInfo(): Promise<string | undefined> {
        const request: requestUtils.Request = (
            await requestUtils.getDefaultRequest(this.azModuleGalleryUrl, undefined, 'GET')
        );

        let xmlResult: string | undefined;
        try {
            await retry(
                async () => {
                    xmlResult = await requestUtils.sendRequest(request);
                },
                { retries: this.numberOfRequestRetries, minTimeout: this.requestTimeoutMs }
            );
        } catch {
            return undefined;
        }
        return xmlResult;
    }

    private async parseLatestAzModuleVersion(azModuleInfo: string | undefined): Promise<string | undefined> {
        if (!azModuleInfo) {
            return undefined;
        }

        return await new Promise((resolve: (ret: string | undefined) => void): void => {
            // tslint:disable-next-line:no-any
            xml2js.parseString(azModuleInfo, { explicitArray: false }, (err: any, result: any): void => {
                if (result && !err) {
                    // tslint:disable-next-line:no-string-literal no-unsafe-any
                    if (result['feed'] && result['feed']['entry'] && Array.isArray(result['feed']['entry'])) {
                        // tslint:disable-next-line:no-string-literal no-unsafe-any
                        const releasedVersions: string[] = result['feed']['entry']
                            // tslint:disable-next-line:no-string-literal no-unsafe-any
                            .filter(entry => entry['m:properties']['d:IsPrerelease']['_'] === 'false')
                            // tslint:disable-next-line:no-string-literal no-unsafe-any
                            .map(entry => entry['m:properties']['d:Version']);

                        // Select the latest version
                        if (releasedVersions.length > 0) {
                            const lastIndex: number = releasedVersions.length - 1;
                            resolve(releasedVersions[lastIndex]);
                            return;
                        }
                    }
                }
                resolve(undefined);
            });
        });
    }
}
