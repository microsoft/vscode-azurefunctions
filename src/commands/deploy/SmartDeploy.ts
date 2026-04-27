/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function smartDeploy(_context: IActionContext, resourceUri?: vscode.Uri): Promise<void> {
    const projectRoot = resolveProjectRoot(resourceUri);
    if (!projectRoot) {
        void vscode.window.showWarningMessage(
            localize('smartDeployNoProject', 'Open a Function App project folder before deploying.')
        );
        return;
    }

    await callWithTelemetryAndErrorHandling('azureFunctions.smartDeploy', async (innerContext: IActionContext) => {
        const azdStatus = detectAzdProject(projectRoot);
        innerContext.telemetry.properties.azdTier = azdStatus.tier;

        switch (azdStatus.tier) {
            case 'azd-functions':
                await handleAzdFunctionsProject(innerContext, projectRoot, azdStatus);
                break;
            case 'bicep-only':
                await handleBicepOnlyProject(innerContext, resourceUri);
                break;
            default:
                // Plain Functions project — go straight to traditional deploy
                innerContext.telemetry.properties.deployPath = 'traditional-direct';
                await runTraditionalDeploy(resourceUri);
        }
    });
}

// ---------------------------------------------------------------------------
// AZD project detection
// ---------------------------------------------------------------------------

interface AzdStatus {
    /** Detection tier */
    tier: 'azd-functions' | 'bicep-only' | 'plain';
    /** True when azure.yaml contains at least one service with host: function */
    hasFunctionService: boolean;
    /** True when infra/ folder with *.bicep or *.tf files exists */
    hasInfra: boolean;
    /** True when azure.yaml is present (regardless of service type) */
    hasAzureYaml: boolean;
}

function detectAzdProject(projectRoot: string): AzdStatus {
    const azureYamlPath = path.join(projectRoot, 'azure.yaml');
    const hasAzureYaml = fs.existsSync(azureYamlPath);

    if (hasAzureYaml) {
        const yamlContent = readFileSafe(azureYamlPath);
        // Check for host: function (handles both quoted and unquoted YAML values)
        const hasFunctionService = /host\s*:\s*["']?function["']?/i.test(yamlContent);
        const hasInfra = detectInfraFolder(projectRoot);

        // Only use AZD-specific deploy flow when azure.yaml actually contains a Functions service;
        // non-Functions AZD projects fall through to the traditional deploy path.
        if (hasFunctionService) {
            return {
                tier: 'azd-functions',
                hasFunctionService,
                hasInfra,
                hasAzureYaml: true,
            };
        }

        // azure.yaml exists but no Functions service — treat like a plain project
        return { tier: 'plain', hasFunctionService: false, hasInfra, hasAzureYaml: true };
    }

    // No azure.yaml — check for Bicep/Terraform infra files (AZD-compatible but not yet initialised)
    if (detectInfraFolder(projectRoot)) {
        return { tier: 'bicep-only', hasFunctionService: false, hasInfra: true, hasAzureYaml: false };
    }

    return { tier: 'plain', hasFunctionService: false, hasInfra: false, hasAzureYaml: false };
}

function detectInfraFolder(projectRoot: string): boolean {
    const infraCandidates = ['infra', 'infrastructure', 'deploy'];
    for (const folder of infraCandidates) {
        const folderPath = path.join(projectRoot, folder);
        if (!fs.existsSync(folderPath)) continue;
        try {
            const entries = fs.readdirSync(folderPath);
            if (entries.some(f => f.endsWith('.bicep') || f.endsWith('.tf'))) {
                return true;
            }
        } catch {
            // ignore read errors
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Tier 1: AZD Functions project (azure.yaml present)
// ---------------------------------------------------------------------------

async function handleAzdFunctionsProject(
    context: IActionContext,
    projectRoot: string,
    azdStatus: AzdStatus
): Promise<void> {
    const azdLabel = localize(
        'deployWithAzd',
        '$(zap) Deploy with Azure Developer CLI (azd up)'
    );
    const azdDetail = azdStatus.hasInfra
        ? localize('deployWithAzdDetail', 'Provisions infrastructure and deploys your code in one command')
        : localize('deployWithAzdDetailNoInfra', 'Deploys your code using the azure.yaml configuration');

    const traditionalLabel = localize('deployTraditional', '$(cloud-upload) Deploy to existing Function App');
    const traditionalDetail = localize('deployTraditionalDetail', 'Zip-deploy to a Function App you choose in Azure');

    const pick = await vscode.window.showQuickPick(
        [
            { label: azdLabel, detail: azdDetail, value: 'azd' as const },
            { label: traditionalLabel, detail: traditionalDetail, value: 'traditional' as const },
        ],
        {
            title: localize('deployQuickPickTitle', 'Deploy Function App'),
            placeHolder: localize('deployQuickPickPlaceholder', 'This project includes Azure Developer CLI configuration (azure.yaml)'),
            ignoreFocusOut: true,
        }
    );

    if (!pick) {
        context.telemetry.properties.deployPath = 'cancelled';
        return;
    }

    if (pick.value === 'azd') {
        context.telemetry.properties.deployPath = 'azd';
        await runAzdDeploy(context, projectRoot);
    } else {
        context.telemetry.properties.deployPath = 'traditional-from-azd-project';
        await runTraditionalDeploy(undefined);
    }
}

// ---------------------------------------------------------------------------
// Tier 2: Bicep files present but no azure.yaml
// ---------------------------------------------------------------------------

async function handleBicepOnlyProject(
    context: IActionContext,
    resourceUri?: vscode.Uri
): Promise<void> {
    const traditionalLabel = localize('deployTraditional', '$(cloud-upload) Deploy to existing Function App');
    const traditionalDetail = localize('deployTraditionalDetail', 'Zip-deploy to a Function App you choose in Azure');

    const setupAzdLabel = localize('setupAzd', '$(add) Initialize Azure Developer CLI for this project');
    const setupAzdDetail = localize('setupAzdDetail', 'Run azd init to enable one-command provisioning and deployment with your Bicep files');

    const pick = await vscode.window.showQuickPick(
        [
            { label: traditionalLabel, detail: traditionalDetail, value: 'traditional' as const },
            { label: setupAzdLabel, detail: setupAzdDetail, value: 'setup-azd' as const },
        ],
        {
            title: localize('deployQuickPickTitle', 'Deploy Function App'),
            placeHolder: localize('deployBicepPlaceholder', 'Infrastructure files detected — azd can manage provisioning and deployment together'),
            ignoreFocusOut: true,
        }
    );

    if (!pick) {
        context.telemetry.properties.deployPath = 'cancelled';
        return;
    }

    if (pick.value === 'setup-azd') {
        context.telemetry.properties.deployPath = 'setup-azd';
        await runAzdInit(resourceUri);
    } else {
        context.telemetry.properties.deployPath = 'traditional-bicep-project';
        await runTraditionalDeploy(resourceUri);
    }
}

// ---------------------------------------------------------------------------
// AZD invocation
// ---------------------------------------------------------------------------

async function runAzdDeploy(context: IActionContext, projectRoot: string): Promise<void> {
    // 1. Try AZD VS Code extension first (best UX — it owns the full flow)
    const azdExtension = vscode.extensions.getExtension('ms-azuretools.azure-dev');
    if (azdExtension) {
        context.telemetry.properties.azdInvocation = 'extension';
        ext.outputChannel.appendLog(localize('azdViaExtension', 'Delegating to Azure Developer CLI extension (azd up)…'));
        await vscode.commands.executeCommand('azure-dev.commands.cli.up');
        return;
    }

    // 2. Try azd CLI on PATH
    if (isAzdCliInstalled()) {
        context.telemetry.properties.azdInvocation = 'cli-terminal';
        ext.outputChannel.appendLog(localize('azdViaCli', 'Running azd up in integrated terminal…'));
        const terminal = vscode.window.createTerminal({
            name: 'Azure Developer CLI',
            cwd: projectRoot,
        });
        terminal.show();
        terminal.sendText('azd up');
        return;
    }

    // 3. Neither available — guide the user
    context.telemetry.properties.azdInvocation = 'not-installed';
    await showAzdNotInstalledError(context);
}

async function runAzdInit(resourceUri?: vscode.Uri): Promise<void> {
    const projectRoot = resolveProjectRoot(resourceUri);

    const azdExtension = vscode.extensions.getExtension('ms-azuretools.azure-dev');
    if (azdExtension) {
        await vscode.commands.executeCommand('azure-dev.commands.cli.init');
        return;
    }

    if (isAzdCliInstalled()) {
        const terminal = vscode.window.createTerminal({
            name: 'Azure Developer CLI',
            cwd: projectRoot,
        });
        terminal.show();
        terminal.sendText('azd init');
        return;
    }

    await showAzdNotInstalledError(undefined);
}

async function showAzdNotInstalledError(context: IActionContext | undefined): Promise<void> {
    const installExt = localize('installAzdExt', 'Install AZD Extension');
    const installCli = localize('installAzdCli', 'Install AZD CLI');

    const choice = await vscode.window.showErrorMessage(
        localize(
            'azdNotInstalled',
            'Azure Developer CLI (azd) is not installed. ' +
            'Install the AZD extension or CLI to use one-command deployment.'
        ),
        installExt,
        installCli
    );

    if (context) {
        context.telemetry.properties.azdNotInstalledChoice = choice ?? 'dismissed';
    }

    if (choice === installExt) {
        await vscode.commands.executeCommand('workbench.extensions.search', 'ms-azuretools.azure-dev');
    } else if (choice === installCli) {
        await vscode.env.openExternal(
            vscode.Uri.parse('https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd')
        );
    }
}

// ---------------------------------------------------------------------------
// Traditional deploy (delegates to existing deployProject command)
// ---------------------------------------------------------------------------

async function runTraditionalDeploy(resourceUri?: vscode.Uri): Promise<void> {
    // Delegate entirely to the existing, well-tested deploy command
    await vscode.commands.executeCommand('azureFunctions.deployProject', resourceUri);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveProjectRoot(resourceUri?: vscode.Uri): string | undefined {
    if (resourceUri) {
        const stat = fs.existsSync(resourceUri.fsPath)
            ? fs.statSync(resourceUri.fsPath)
            : undefined;
        return stat?.isDirectory() ? resourceUri.fsPath : path.dirname(resourceUri.fsPath);
    }

    const activeFile = vscode.window.activeTextEditor?.document.uri;
    if (activeFile) {
        const folder = vscode.workspace.getWorkspaceFolder(activeFile);
        if (folder) return folder.uri.fsPath;
    }

    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function isAzdCliInstalled(): boolean {
    try {
        execSync('azd version', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

function readFileSafe(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
}
