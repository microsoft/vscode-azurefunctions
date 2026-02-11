/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, callWithTelemetryAndErrorHandling, nonNullProp, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as path from 'path';
import { l10n, Uri, window, workspace, type Progress } from "vscode";
import { McpProjectType, ProjectLanguage, type GitHubFileMetadata } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { feedUtils } from "../../../utils/feedUtils";
import { addLocalMcpServer, checkIfMcpServerExists, getLocalServerName, getOrCreateMcpJson, saveMcpJson } from "../../../utils/mcpUtils";
import { getContainingWorkspace } from "../../../utils/workspace";
import { type MCPProjectWizardContext } from "../IProjectWizardContext";
import { ProjectCreateStepBase } from "../ProjectCreateStep/ProjectCreateStepBase";
import { MCPDownloadSnippetsExecuteStep } from "./MCPDownloadSnippetsExecuteStep";

interface ICachedMcpProject {
    projectPath: string;
}

const mcpProjectCacheKey: string = 'azFuncPostMcpProjectCreate';

export async function runPostMcpProjectCreateStepsFromCache(): Promise<void> {
    const cachedProject: ICachedMcpProject | undefined = ext.context.globalState.get(mcpProjectCacheKey);
    if (cachedProject) {
        try {
            runPostMcpProjectCreateSteps(cachedProject);
        } finally {
            await ext.context.globalState.update(mcpProjectCacheKey, undefined);
        }
    }
}

function runPostMcpProjectCreateSteps(project: ICachedMcpProject): void {
    // Don't wait
    void callWithTelemetryAndErrorHandling('postMcpProjectCreate', async (context: IActionContext) => {
        context.telemetry.suppressIfSuccessful = true;

        // Open mcp.json file in an editor
        if (getContainingWorkspace(project.projectPath)) {
            const mcpJsonFilePath: string = path.join(project.projectPath, '.vscode', 'mcp.json');
            if (await AzExtFsExtra.pathExists(mcpJsonFilePath)) {
                const mcpJsonFile = await workspace.openTextDocument(Uri.file(mcpJsonFilePath));
                await window.showTextDocument(mcpJsonFile, { preview: false });
            }
        }
    });
}

export class MCPProjectCreateStep extends ProjectCreateStepBase {
    public async executeCore(context: MCPProjectWizardContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
        context.mcpProjectType = McpProjectType.SelfHostedMcpServer;
        this.setSampleMcpRepoUrl(context);
        await this.addLocalMcpServer(context);

        if (!context.includeSnippets) {
            // if the user opted out of snippets, we still need to download the function artifact files
            const sampleFiles: GitHubFileMetadata[] = await feedUtils.getJsonFeed(context, nonNullProp(context, 'sampleMcpRepoUrl'));
            const essentialFileNames: string[] = ['host.json', 'local.settings.json'];
            if (context.serverLanguage !== ProjectLanguage.CSharp) {
                essentialFileNames.push('.funcignore');
            }
            const functionArtifactFiles: GitHubFileMetadata[] = sampleFiles.filter(f => essentialFileNames.includes(f.name));
            for (const file of functionArtifactFiles) {
                await MCPDownloadSnippetsExecuteStep.downloadSingleFile({
                    context,
                    item: file,
                    destDirPath: context.projectPath,
                    projectName: path.basename(context.projectPath),
                    serverLanguage: context.serverLanguage
                });
            }
        }
        
        const cachedProject: ICachedMcpProject = { projectPath: context.projectPath };
        
        if (context.openBehavior) {
            // OpenFolderStep sometimes restarts the extension host, so we will cache this to run on the next extension activation
            await ext.context.globalState.update(mcpProjectCacheKey, cachedProject);
            // Delete cached information if the extension host was not restarted after 5 seconds
            setTimeout(() => { void ext.context.globalState.update(mcpProjectCacheKey, undefined); }, 5 * 1000);
        }

        runPostMcpProjectCreateSteps(cachedProject);
        
        return;
    }

    private setSampleMcpRepoUrl(context: MCPProjectWizardContext): void {
        switch (context.serverLanguage) {
            case ProjectLanguage.Python:
                context.sampleMcpRepoUrl = 'https://aka.ms/mcpSamplePython';
                break;
            case ProjectLanguage.TypeScript:
                context.sampleMcpRepoUrl = 'https://aka.ms/mcpSampleTypeScript';
                break;
            case ProjectLanguage.CSharp:
                context.sampleMcpRepoUrl = 'https://aka.ms/mcpSampleCSharp';
                break;
            default:
                throw new Error(l10n.t('Unsupported language for sample code: {0}', context.serverLanguage || 'unknown'));
        }
    }

    private async addLocalMcpServer(context: MCPProjectWizardContext): Promise<void> {
        const workspace = context.projectPath;
        const mcpJson = await getOrCreateMcpJson(workspace);
        const serverName = getLocalServerName(workspace);
        // only add if it doesn't already exist
        if (!checkIfMcpServerExists(mcpJson, serverName)) {
            const newMcpJson = await addLocalMcpServer(mcpJson, serverName, McpProjectType.SelfHostedMcpServer);
            await saveMcpJson(workspace, newMcpJson);
        }
    }
}
