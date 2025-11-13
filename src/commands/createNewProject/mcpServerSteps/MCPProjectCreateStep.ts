/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from "@microsoft/vscode-azext-utils";
import * as path from 'path';
import { l10n, type Progress } from "vscode";
import { McpProjectType, ProjectLanguage, type GitHubFileMetadata } from "../../../constants";
import { feedUtils } from "../../../utils/feedUtils";
import { addLocalMcpServer, checkIfMcpServerExists, getLocalServerName, getOrCreateMcpJson, saveMcpJson } from "../../../utils/mcpUtils";
import { requestUtils } from "../../../utils/requestUtils";
import { type MCPProjectWizardContext } from "../IProjectWizardContext";
import { ProjectCreateStepBase } from "../ProjectCreateStep/ProjectCreateStepBase";
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
                await this.downloadSingleFile(context, file);
            }
        }
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

    private async downloadSingleFile(context: MCPProjectWizardContext, item: GitHubFileMetadata): Promise<void> {
        const fileUrl: string = item.download_url;
        const destinationPath: string = path.join(context.projectPath, item.name);
        const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: fileUrl });
        const fileContent = response.bodyAsText;
        await AzExtFsExtra.writeFile(destinationPath, fileContent ?? '');
    }
}
