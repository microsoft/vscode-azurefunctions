/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type Progress } from 'vscode';
import { hostFileName, ProjectLanguage, type GitHubFileMetadata } from '../../../constants';
import { localize } from "../../../localize";
import { feedUtils } from '../../../utils/feedUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { parseJson } from '../../../utils/parseJson';
import { requestUtils } from '../../../utils/requestUtils';
import { type MCPProjectWizardContext } from '../IProjectWizardContext';

export class MCPDownloadSnippetsExecuteStep extends AzureWizardExecuteStepWithActivityOutput<MCPProjectWizardContext> {
    stepName: string = 'MCPDownloadSampleCodeExecuteStep';
    protected getTreeItemLabel(context: MCPProjectWizardContext): string {
        return localize('downloadSampleCode', 'Downloading {0} sample server code', nonNullProp(context, 'serverLanguage'));
    }
    protected getOutputLogSuccess(context: MCPProjectWizardContext): string {
        return localize('downloadSampleCodeSuccess', 'Successfully downloaded {0} sample server code', nonNullProp(context, 'serverLanguage'));
    }
    protected getOutputLogFail(context: MCPProjectWizardContext): string {
        return localize('downloadSampleCodeFail', 'Failed to download {0} sample server code', nonNullProp(context, 'serverLanguage'));
    }
    protected getOutputLogProgress(context: MCPProjectWizardContext): string {
        return localize('downloadingSampleCode', 'Downloading {0} sample server code...', nonNullProp(context, 'serverLanguage'));
    }

    public priority: number = 12;

    public async execute(context: MCPProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('downloadingSampleCodeExecute', 'Downloading sample server code...') });
        const sampleMcpRepoUrl: string = nonNullProp(context, 'sampleMcpRepoUrl');
        const sampleFiles: GitHubFileMetadata[] = await feedUtils.getJsonFeed(context, sampleMcpRepoUrl);
        await this.downloadFilesRecursively(context, sampleFiles, context.projectPath);
    }

    private async downloadFilesRecursively(context: MCPProjectWizardContext, items: GitHubFileMetadata[], basePath: string): Promise<void> {
        for (const item of items) {
            if (item.type === 'file') {
                await MCPDownloadSnippetsExecuteStep.downloadSingleFile(context, item, basePath);
            } else if (item.type === 'dir') {
                // Create directory
                const dirPath: string = path.join(basePath, item.name);
                await AzExtFsExtra.ensureDir(dirPath);

                // Get directory contents
                const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: item.url });
                const dirContents: GitHubFileMetadata[] = parseJson<GitHubFileMetadata[]>(nonNullProp(response, 'bodyAsText'));

                // Recursively download directory contents
                await this.downloadFilesRecursively(context, dirContents, dirPath);
            }
        }
    }

    public shouldExecute(context: MCPProjectWizardContext): boolean {
        return context.includeSnippets === true;
    }

    public static async downloadSingleFile(context: MCPProjectWizardContext, item: GitHubFileMetadata, dirPath: string): Promise<void> {
        const fileUrl: string = item.download_url;
        let destinationPath: string = path.join(dirPath, item.name);
        const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: fileUrl });
        let fileContent = response.bodyAsText;
        if (context.serverLanguage === ProjectLanguage.CSharp) {
            if (item.name === hostFileName) {
                // for C#, we need to replace the host.json
                // "arguments": ["<path to the compiled DLL, e.g. HelloWorld.dll>"] with the name of the actual DLL
                const dllName: string = `${path.basename(context.projectPath)}.dll`;
                fileContent = fileContent?.replace('<path to the compiled DLL, e.g. HelloWorld.dll>', dllName);
            } else if (item.name === 'dotnet.csproj') {
                // for C#, the project file needs to be named after the project folder
                const csprojFileName: string = `${path.basename(context.projectPath)}.csproj`;
                destinationPath = path.join(dirPath, csprojFileName);
            }
        }
        await AzExtFsExtra.writeFile(destinationPath, fileContent ?? '');
    }
}
