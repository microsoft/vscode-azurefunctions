/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type StringDictionary } from '@azure/arm-appservice';
import { BlobServiceClient } from '@azure/storage-blob';
import { getDeployFsPath, getDeployNode, type IDeployPaths, type SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { nonNullProp, parseError, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';
import { Uri, ViewColumn, window, workspace } from 'vscode';
import { CodeAction, hostFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { ResolvedFunctionAppResource } from '../../../tree/ResolvedFunctionAppResource';
import { type SlotTreeItem } from '../../../tree/SlotTreeItem';
import { AzdProvisioningRunner } from '../../../tree/azdProvisioning/AzdProvisioningRunner';
import { createActivityContext } from '../../../utils/activityUtils';
import { treeUtils } from '../../../utils/treeUtils';
import { isAzdInstalled } from '../../createFunctionApp/azd/isAzdInstalled';
import { tryGetFunctionProjectRoot } from '../../createNewProject/verifyIsProject';
import { type IFuncDeployContext } from '../deploy';
import { getOrCreateFunctionApp } from '../getOrCreateFunctionApp';
import { generateAzdYamlFromSite } from './generateAzdYamlFromSite';
import { generateBicepFromSite } from './generateBicepFromSite';

/**
 * Deploy to an existing Function App using the Azure Developer CLI (azd).
 *
 * Instead of prompting through wizard steps, this command reads the target function app's
 * site envelope and app settings to automatically generate the Bicep template and azure.yaml
 * needed for `azd deploy`.
 *
 * Flow:
 * 1. Verify azd is installed
 * 2. Get the local deploy path (function project folder)
 * 3. Select the target Function App (from tree node or picker)
 * 4. Read the site envelope and app settings from the existing app
 * 5. Generate Bicep template + azure.yaml from the site envelope
 * 6. Create a temporary AZD project directory with the generated files
 * 7. Run `azd deploy --no-prompt` via the AzdProvisioningRunner
 * 8. Clean up the temp directory
 */
export async function deployWithAzd(context: IActionContext, target?: vscode.Uri | string | SlotTreeItem): Promise<void> {
    // 1. Verify azd is installed
    if (!(await isAzdInstalled())) {
        throw new Error(
            localize('azdNotInstalled', 'Azure Developer CLI (azd) is required for this command. Install it from https://aka.ms/azd-install'),
        );
    }

    // 2. Get deploy paths (local folder containing the function project)
    const deployPaths: IDeployPaths = await getDeployFsPath(context, target);
    const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, deployPaths.workspaceFolder);
    if (!projectPath) {
        throw new Error(
            localize('noFunctionProject', 'No Azure Functions project root found. Ensure a {0} file exists.', hostFileName),
        );
    }

    // 3. Build the deploy context (matches existing deploy flow)
    const deployContext: IFuncDeployContext = Object.assign(context, deployPaths, {
        ...await createActivityContext(),
        action: CodeAction.Deploy,
        defaultAppSetting: 'defaultFunctionAppToDeploy',
        projectPath,
    });

    // If the target is a tree item, validate it's a function app
    let resolvedTarget = target;
    if (treeUtils.isAzExtTreeItem(resolvedTarget)) {
        if (
            !resolvedTarget.contextValue.match(ResolvedFunctionAppResource.pickSlotContextValue) &&
            !resolvedTarget.contextValue.match(ResolvedFunctionAppResource.productionContextValue) &&
            !resolvedTarget.contextValue.match(ResolvedFunctionAppResource.flexContextValue)
        ) {
            resolvedTarget = undefined;
        }
    }

    // 4. Get or select the target function app
    const node: SlotTreeItem = await getDeployNode(deployContext, ext.rgApi.tree, resolvedTarget, undefined, async () => {
        return await getOrCreateFunctionApp(deployContext);
    });

    await node.initSite(deployContext);
    const site = node.site;
    const rawSite = site.rawSite;

    // 5. Read app settings from the existing function app
    const client = await site.createClient(deployContext);
    const appSettings: StringDictionary = await client.listApplicationSettings();

    // 6. Generate Bicep + azure.yaml from the site envelope
    const siteName = nonNullProp(rawSite, 'name');
    const rgName = site.resourceGroup;
    const location = nonNullProp(rawSite, 'location');
    const deployFsPath = deployPaths.effectiveDeployFsPath;

    ext.outputChannel.appendLog(
        localize('generatingAzdFiles', 'Generating AZD infrastructure files from function app "{0}"...', siteName),
    );

    const { bicepContent, parametersContent } = generateBicepFromSite(rawSite, appSettings);
    const azdYaml = generateAzdYamlFromSite(rawSite, appSettings, deployFsPath);

    // 7. Create temporary AZD project directory
    const tmpDir = path.join(os.tmpdir(), `azfunc-azd-deploy-${siteName}-${Date.now()}`);
    const infraDir = path.join(tmpDir, 'infra');
    await fs.promises.mkdir(infraDir, { recursive: true });

    await Promise.all([
        fs.promises.writeFile(path.join(tmpDir, 'azure.yaml'), azdYaml, 'utf-8'),
        fs.promises.writeFile(path.join(infraDir, 'main.bicep'), bicepContent, 'utf-8'),
        fs.promises.writeFile(path.join(infraDir, 'main.parameters.json'), parametersContent, 'utf-8'),
    ]);

    // Open the generated Bicep file for reference
    const mainBicepUri = Uri.file(path.join(infraDir, 'main.bicep'));
    const doc = await workspace.openTextDocument(mainBicepUri);
    await window.showTextDocument(doc, { viewColumn: ViewColumn.Beside, preview: true, preserveFocus: true });

    try {
        // 8. Write AZD environment config
        const envName = sanitizeEnvName(siteName);
        const azureDir = path.join(tmpDir, '.azure');
        const envDir = path.join(azureDir, envName);
        await fs.promises.mkdir(envDir, { recursive: true });

        await fs.promises.writeFile(
            path.join(azureDir, 'config.json'),
            JSON.stringify({ version: 1, defaultEnvironment: envName }, null, 2),
            'utf-8',
        );

        const envFileContent = [
            `AZURE_LOCATION="${location}"`,
            `AZURE_SUBSCRIPTION_ID="${node.subscription.subscriptionId}"`,
            `AZURE_RESOURCE_GROUP="${rgName}"`,
        ].join('\n');

        await fs.promises.writeFile(path.join(envDir, '.env'), envFileContent, 'utf-8');

        // 9. Ensure the deployment storage container exists (flex consumption only)
        await ensureDeploymentStorageContainer(rawSite, appSettings, node.subscription);

        // 9b. Disable remote build so Kudu/Oryx doesn't try to build the pre-built zip
        await disableRemoteBuild(client, siteName);

        // 10. Run `azd deploy --no-prompt` via the terminal runner
        const azdEnvVars: Record<string, string> = {
            AZURE_LOCATION: location,
            AZURE_SUBSCRIPTION_ID: node.subscription.subscriptionId,
            AZURE_RESOURCE_GROUP: rgName,
        };

        const runner = new AzdProvisioningRunner(ext.azdProvisioningTreeProvider);
        await runner.run(
            tmpDir,
            ['deploy', '--no-prompt'],
            localize('azdDeploySession', 'Deploy to "{0}" via AZD', siteName),
            azdEnvVars,
        );

        ext.outputChannel.appendLog(
            localize('azdDeploySuccess', 'Successfully deployed to function app "{0}" via AZD.', siteName),
        );
        void window.showInformationMessage(
            localize('azdDeployComplete', 'Successfully deployed to "{0}" via AZD.', siteName),
        );
    } finally {
        // 11. Clean up temp directory
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

/**
 * Sanitizes a string for use as an azd environment name.
 * Environment names may only contain alphanumeric characters and hyphens, max 64 chars.
 */
function sanitizeEnvName(name: string): string {
    return name.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 64);
}

/**
 * Disables Kudu/Oryx remote build on the function app.
 *
 * When `azd deploy` pushes a zip to a Linux function app, Kudu may trigger an Oryx
 * remote build (running `tsc`, `npm install`, etc.), which can fail or is unnecessary
 * since the code is already pre-built locally. This function removes the app settings
 * that enable remote build, matching the behavior of the standard VS Code deploy flow
 * for flex consumption and non-remote-build scenarios.
 */
async function disableRemoteBuild(client: SiteClient, siteName: string): Promise<void> {
    const remoteBuildsettingsToRemove = [
        'ENABLE_ORYX_BUILD',
        'SCM_DO_BUILD_DURING_DEPLOYMENT',
        'BUILD_FLAGS',
        'XDG_CACHE_HOME',
    ];

    try {
        const currentSettings = await client.listApplicationSettings();
        const props = currentSettings.properties ?? {};
        let changed = false;

        for (const key of remoteBuildsettingsToRemove) {
            if (props[key]) {
                delete props[key];
                changed = true;
            }
        }

        if (changed) {
            ext.outputChannel.appendLog(
                localize('disablingRemoteBuild', 'Disabling remote build on "{0}" to prevent Oryx from building the pre-built package...', siteName),
            );
            currentSettings.properties = props;
            await client.updateApplicationSettings(currentSettings);
        }
    } catch (error) {
        const parsed = parseError(error);
        ext.outputChannel.appendLog(
            localize('disableRemoteBuildFailed', 'Warning: Failed to disable remote build settings: {0}', parsed.message),
        );
    }
}

/**
 * Ensures the deployment storage blob container exists for flex consumption apps.
 *
 * For flex consumption function apps, the deployment storage container URL is specified
 * in `functionAppConfig.deployment.storage.value` (e.g.
 * `https://<account>.blob.core.windows.net/app-package-<name>`).
 * This container must exist before `azd deploy` can upload the zip package.
 *
 * The function tries token-based auth first (via subscription credentials), then
 * falls back to a connection string from app settings.
 */
async function ensureDeploymentStorageContainer(
    site: Site,
    appSettings: StringDictionary,
    subscription: ISubscriptionContext,
): Promise<void> {
    const containerUrl = site.functionAppConfig?.deployment?.storage?.value;
    if (!containerUrl) {
        // Not a flex consumption app or no deployment storage configured — nothing to do
        return;
    }

    // Parse the container URL: https://<account>.blob.core.windows.net/<containerName>
    let blobEndpoint: string;
    let containerName: string;
    try {
        const url = new URL(containerUrl);
        containerName = url.pathname.split('/').filter(Boolean).pop() ?? '';
        blobEndpoint = `${url.protocol}//${url.host}`;
    } catch {
        ext.outputChannel.appendLog(
            localize('invalidContainerUrl', 'Could not parse deployment storage URL: {0}', containerUrl),
        );
        return;
    }

    if (!containerName) {
        ext.outputChannel.appendLog(
            localize('noContainerName', 'No container name found in deployment storage URL: {0}', containerUrl),
        );
        return;
    }

    ext.outputChannel.appendLog(
        localize('ensuringContainer', 'Ensuring deployment storage container "{0}" exists...', containerName),
    );

    let client: BlobServiceClient;
    try {
        // Try token-based authentication first (uses subscription credentials for storage scope)
        const token = await subscription.createCredentialsForScopes(['https://storage.azure.com/.default']);
        client = new BlobServiceClient(blobEndpoint, token);
        await client.getProperties(); // Validate credentials
    } catch {
        // Fall back to connection string from app settings
        const connString =
            appSettings.properties?.['AzureWebJobsStorage'] ??
            appSettings.properties?.['DEPLOYMENT_STORAGE_CONNECTION_STRING'];
        if (!connString) {
            ext.outputChannel.appendLog(
                localize('noStorageCredentials', 'Could not authenticate to storage. No connection string found in app settings.'),
            );
            return;
        }
        client = BlobServiceClient.fromConnectionString(connString);
    }

    try {
        const containerClient = client.getContainerClient(containerName);
        if (!(await containerClient.exists())) {
            await containerClient.create();
            ext.outputChannel.appendLog(
                localize('containerCreated', 'Created deployment storage container "{0}".', containerName),
            );
        } else {
            ext.outputChannel.appendLog(
                localize('containerExists', 'Deployment storage container "{0}" already exists.', containerName),
            );
        }
    } catch (error) {
        const parsed = parseError(error);
        ext.outputChannel.appendLog(
            localize('containerCreateFailed', 'Failed to ensure deployment storage container exists: {0}', parsed.message),
        );
    }
}
