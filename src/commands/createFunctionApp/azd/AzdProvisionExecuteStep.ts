/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type WebSiteManagementClient } from '@azure/arm-appservice';
import { LocationListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStepWithActivityOutput, nonNullProp } from '@microsoft/vscode-azext-utils';
import { type AppResource } from '@microsoft/vscode-azext-utils/hostapi';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { type Progress, Uri, ViewColumn, window, workspace } from 'vscode';
import { webProvider } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { createWebSiteClient } from '../../../utils/azureClients';
import { AzdProvisioningRunner } from '../../../tree/azdProvisioning/AzdProvisioningRunner';
import { type IFlexFunctionAppWizardContext, type IFunctionAppWizardContext } from '../IFunctionAppWizardContext';
import { generateAzdYaml } from './generateAzdYaml';
import { generateBicepTemplate } from './generateBicepTemplate';

/**
 * An execute step that:
 * 1. Generates a Bicep template from the wizard context
 * 2. Writes it (along with azure.yaml) to a temporary directory
 * 3. Runs `azd provision` to deploy the infrastructure
 * 4. Retrieves the created Function App Site object from ARM and sets it on context
 *
 * This replaces the individual ResourceGroupCreateStep, StorageAccountCreateStep,
 * AppServicePlanCreateStep, LogAnalyticsCreateStep, AppInsightsCreateStep,
 * FunctionAppCreateStep, UserAssignedIdentityCreateStep, and RoleAssignmentExecuteStep
 * for the standard (non-Docker) flow.
 */
export class AzdProvisionExecuteStep extends AzureWizardExecuteStepWithActivityOutput<IFunctionAppWizardContext> {
    // This step replaces ALL individual ARM create steps, so it runs at the end
    public priority: number = 50;
    public stepName: string = 'azdProvisionStep';

    public async execute(context: IFlexFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const siteName = nonNullProp(context, 'newSiteName');
        const rgName = nonNullProp(context, 'newResourceGroupName');
        const location = await LocationListStep.getLocation(context, webProvider);
        const locationName = nonNullProp(location, 'name');

        // 1. Generate the Bicep template and azure.yaml from wizard context
        progress.report({ message: localize('generatingInfra', 'Generating infrastructure template...') });
        const { mainBicepContent, resourcesBicepContent, parametersContent } = generateBicepTemplate(context);
        const azdYaml = generateAzdYaml(context);

        // 2. Write to a temporary AZD project directory
        const tmpDir = await this.createTempAzdProject(siteName, mainBicepContent, resourcesBicepContent, parametersContent, azdYaml);

        try {
            // 2b. Open the generated Bicep file in the editor so the user can see the template
            const mainBicepPath = path.join(tmpDir, 'infra', 'main.bicep');
            const doc = await workspace.openTextDocument(Uri.file(mainBicepPath));
            await window.showTextDocument(doc, { viewColumn: ViewColumn.Beside, preview: true, preserveFocus: true });

            // 3. Set up the AZD environment by writing files directly (avoids shell quoting issues)
            progress.report({ message: localize('initAzdEnv', 'Initializing AZD environment...') });
            const envName = sanitizeEnvName(siteName);

            const azdEnvVars = {
                AZURE_LOCATION: locationName,
                AZURE_SUBSCRIPTION_ID: context.subscriptionId,
                AZURE_RESOURCE_GROUP: rgName,
            };

            await this.writeAzdEnvironment(tmpDir, envName, azdEnvVars);

            // 4. Run azd provision in a VS Code terminal with output streamed to the provisioning tree view
            //    Pass env vars both via .env file AND as terminal process env to ensure azd reads them
            progress.report({ message: localize('provisioning', 'Provisioning resources with AZD for "{0}"...', siteName) });

            // Pre-register all expected resources so they appear in the tree view immediately,
            // even if azd doesn't report individual progress for each one.
            const storageAccountName = context.newStorageAccountName ?? siteName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 24);
            const planName = context.newPlanName ?? `ASP-${siteName}`;
            const appInsightsName = context.newAppInsightsName ?? siteName;
            const expectedResources: { name: string; type: string }[] = [
                { name: rgName, type: 'Resource group' },
                { name: storageAccountName, type: 'Storage account' },
                { name: `workspace-${appInsightsName}`, type: 'Log Analytics workspace' },
                { name: appInsightsName, type: 'Application Insights' },
                { name: planName, type: 'App Service plan' },
                { name: siteName, type: 'Function App' },
            ];
            if (context.useManagedIdentity) {
                expectedResources.push({
                    name: context.newManagedIdentityName ?? `id-${siteName}`,
                    type: 'Managed Identity',
                });
            }

            const runner = new AzdProvisioningRunner(ext.azdProvisioningTreeProvider);
            await runner.run(
                tmpDir,
                ['provision', '--no-prompt'],
                localize('azdProvisionSession', 'Provision "{0}"', siteName),
                azdEnvVars,
                expectedResources,
            );

            // 5. Retrieve the created Function App from ARM to populate context.site
            progress.report({ message: localize('retrievingSite', 'Retrieving created function app...') });
            const client: WebSiteManagementClient = await createWebSiteClient(context);
            const site: Site = await client.webApps.get(rgName, siteName);

            context.site = site;
            context.activityResult = site as AppResource;

            ext.outputChannel.appendLog(localize('azdProvisionSuccess', 'Successfully provisioned function app "{0}" via AZD.', siteName));
        } finally {
            // 6. Clean up the temp directory
            this.cleanupTempDir(tmpDir);
        }
    }

    public shouldExecute(context: IFunctionAppWizardContext): boolean {
        return !context.site;
    }

    /**
     * Creates a temporary directory with the AZD project structure:
     *   tmpDir/
     *     azure.yaml
     *     infra/
     *       main.bicep
     *       main.parameters.json
     *       resources.bicep
     */
    private async createTempAzdProject(
        siteName: string,
        mainBicepContent: string,
        resourcesBicepContent: string,
        parametersContent: string,
        azdYaml: string,
    ): Promise<string> {
        const tmpDir = path.join(os.tmpdir(), `azfunc-azd-${siteName}-${Date.now()}`);
        const infraDir = path.join(tmpDir, 'infra');

        await fs.promises.mkdir(infraDir, { recursive: true });
        await Promise.all([
            fs.promises.writeFile(path.join(tmpDir, 'azure.yaml'), azdYaml, 'utf-8'),
            fs.promises.writeFile(path.join(infraDir, 'main.bicep'), mainBicepContent, 'utf-8'),
            fs.promises.writeFile(path.join(infraDir, 'resources.bicep'), resourcesBicepContent, 'utf-8'),
            fs.promises.writeFile(path.join(infraDir, 'main.parameters.json'), parametersContent, 'utf-8'),
        ]);

        return tmpDir;
    }

    /**
     * Writes AZD environment config files directly, avoiding shell quoting issues
     * with `azd env set`. Creates:
     *   .azure/config.json              — sets default environment
     *   .azure/<envName>/.env           — environment variable values
     */
    private async writeAzdEnvironment(
        projectDir: string,
        envName: string,
        envVars: Record<string, string>,
    ): Promise<void> {
        const azureDir = path.join(projectDir, '.azure');
        const envDir = path.join(azureDir, envName);

        await fs.promises.mkdir(envDir, { recursive: true });

        // Write .azure/config.json to set the default environment
        const configJson = JSON.stringify({ version: 1, defaultEnvironment: envName }, null, 2);
        await fs.promises.writeFile(path.join(azureDir, 'config.json'), configJson, 'utf-8');

        // Write .azure/<envName>/.env with all environment variables
        const envFileContent = Object.entries(envVars)
            .map(([key, value]) => `${key}="${value}"`)
            .join('\n');
        await fs.promises.writeFile(path.join(envDir, '.env'), envFileContent, 'utf-8');
    }

    /**
     * Best-effort cleanup of the temporary AZD project directory.
     */
    private cleanupTempDir(tmpDir: string): void {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors — the OS will clean temp eventually
        }
    }

    protected getTreeItemLabel(context: IFunctionAppWizardContext): string {
        return localize('provisionWithAzd', 'Provision function app "{0}" via AZD', nonNullProp(context, 'newSiteName'));
    }

    protected getOutputLogSuccess(context: IFunctionAppWizardContext): string {
        return localize('azdProvisionSuccess', 'Successfully provisioned function app "{0}" via AZD.', nonNullProp(context, 'newSiteName'));
    }

    protected getOutputLogFail(context: IFunctionAppWizardContext): string {
        return localize('azdProvisionFail', 'Failed to provision function app "{0}" via AZD.', nonNullProp(context, 'newSiteName'));
    }

    protected getOutputLogProgress(context: IFunctionAppWizardContext): string {
        return localize('azdProvisionProgress', 'Provisioning function app "{0}" via AZD...', nonNullProp(context, 'newSiteName'));
    }
}

/**
 * Sanitizes a Function App name into a valid AZD environment name.
 * AZD env names must be alphanumeric with hyphens, 1-64 chars.
 */
function sanitizeEnvName(name: string): string {
    return name.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 64);
}
