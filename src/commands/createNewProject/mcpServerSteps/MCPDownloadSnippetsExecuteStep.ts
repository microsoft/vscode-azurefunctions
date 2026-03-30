/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, type IActionContext } from '@microsoft/vscode-azext-utils';
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
        const downloadedFiles = await this.downloadFilesRecursively(context, sampleFiles, context.projectPath);
        context.sampleToolFilePath = MCPDownloadSnippetsExecuteStep.selectSampleToolFile(context.serverLanguage, downloadedFiles);
    }

    // Known entrypoint paths relative to the root of each language's sample GitHub repository
    private static readonly knownToolPaths: Partial<Record<ProjectLanguage, string>> = {
        [ProjectLanguage.TypeScript]: 'src/index.ts',
        [ProjectLanguage.Python]: 'hello.py',
        [ProjectLanguage.CSharp]: 'Tools/HelloTool.cs',
    };

    private static readonly languageExtensions: Partial<Record<ProjectLanguage, string>> = {
        [ProjectLanguage.TypeScript]: '.ts',
        [ProjectLanguage.Python]: '.py',
        [ProjectLanguage.CSharp]: '.cs',
    };

    private static selectSampleToolFile(
        language: ProjectLanguage | undefined,
        files: { itemPath: string; destPath: string }[]
    ): string | undefined {
        if (!language) return undefined;

        // Prefer the known entrypoint path for the language
        const knownPath = MCPDownloadSnippetsExecuteStep.knownToolPaths[language];
        if (knownPath) {
            const match = files.find(f => f.itemPath === knownPath);
            if (match) return match.destPath;
        }

        // Fallback: any file with the right extension, sorted for determinism
        const sourceExt = MCPDownloadSnippetsExecuteStep.languageExtensions[language];
        if (sourceExt) {
            const candidates = files
                .filter(f => f.destPath.endsWith(sourceExt))
                .sort((a, b) => a.itemPath.localeCompare(b.itemPath));
            return candidates[0]?.destPath;
        }

        return undefined;
    }

    private async downloadFilesRecursively(
        context: MCPProjectWizardContext,
        items: GitHubFileMetadata[],
        basePath: string
    ): Promise<{ itemPath: string; destPath: string }[]> {
        const downloadedFiles: { itemPath: string; destPath: string }[] = [];
        // Download all files and directories at this level in parallel
        await Promise.all(items.map(async (item) => {
            if (item.type === 'file') {
                const destPath = await MCPDownloadSnippetsExecuteStep.downloadSingleFile({
                    context, item,
                    destDirPath: basePath,
                    serverLanguage: context.serverLanguage,
                    projectName: path.basename(context.projectPath)
                });
                downloadedFiles.push({ itemPath: item.path, destPath });
            } else if (item.type === 'dir') {
                // Create directory
                const dirPath: string = path.join(basePath, item.name);
                await AzExtFsExtra.ensureDir(dirPath);

                // Get directory contents
                const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: item.url });
                const dirContents: GitHubFileMetadata[] = parseJson<GitHubFileMetadata[]>(nonNullProp(response, 'bodyAsText'));

                // Recursively download directory contents
                const subFiles = await this.downloadFilesRecursively(context, dirContents, dirPath);
                downloadedFiles.push(...subFiles);
            }
        }));
        return downloadedFiles;
    }

    public shouldExecute(context: MCPProjectWizardContext): boolean {
        return context.includeSnippets === true;
    }

    public static async downloadSingleFile(options: {
        context: IActionContext,
        item: GitHubFileMetadata,
        destDirPath: string,
        projectName: string
        serverLanguage?: ProjectLanguage,
    }): Promise<string> {
        const { context, item, destDirPath, serverLanguage, projectName } = options;
        const fileUrl: string = item.download_url;
        let destinationPath: string = path.join(destDirPath, item.name);
        const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: fileUrl });
        let fileContent = response.bodyAsText;
        if (serverLanguage === ProjectLanguage.CSharp) {
            if (item.name === hostFileName) {
                // for C#, we need to replace the host.json
                // "arguments": ["<path to the compiled DLL, e.g. HelloWorld.dll>"] with the name of the actual DLL
                const dllName: string = `${projectName}.dll`;
                fileContent = fileContent?.replace('<path to the compiled DLL, e.g. HelloWorld.dll>', dllName);
            } else if (item.name === 'dotnet.csproj') {
                // for C#, the project file needs to be named after the project folder
                const csprojFileName: string = `${projectName}.csproj`;
                destinationPath = path.join(destDirPath, csprojFileName);
            }
        }
        await AzExtFsExtra.writeFile(destinationPath, fileContent ?? '');
        return destinationPath;
    }
}
