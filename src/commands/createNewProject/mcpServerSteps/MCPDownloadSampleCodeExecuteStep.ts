/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type Progress } from 'vscode';
import { ProjectLanguage, type GitHubFileMetadata } from '../../../constants';
import { localize } from "../../../localize";
import { feedUtils } from '../../../utils/feedUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { parseJson } from '../../../utils/parseJson';
import { requestUtils } from '../../../utils/requestUtils';
import { type MCPProjectWizardContext } from '../IProjectWizardContext';

export class MCPDownloadSampleCodeExecuteStep extends AzureWizardExecuteStepWithActivityOutput<MCPProjectWizardContext> {
    stepName: string = 'MCPDownloadSampleCodeExecuteStep';
    protected getTreeItemLabel(context: MCPProjectWizardContext): string {
        return context.includeSampleCode ?
            localize('downloadSampleCode', 'Downloading {0} sample server code', nonNullProp(context, 'serverLanguage')) :
            localize('downloadEssentialFiles', 'Downloading functions artifact files');
    }
    protected getOutputLogSuccess(context: MCPProjectWizardContext): string {
        return context.includeSampleCode ?
            localize('downloadSampleCodeSuccess', 'Successfully downloaded {0} sample server code"', nonNullProp(context, 'serverLanguage')) :
            localize('downloadEssentialFilesSuccess', 'Successfully downloaded functions artifact files');
    }
    protected getOutputLogFail(context: MCPProjectWizardContext): string {
        return context.includeSampleCode ?
            localize('downloadSampleCodeFail', 'Failed to download {0} sample server code', nonNullProp(context, 'serverLanguage')) :
            localize('downloadEssentialFilesFail', 'Failed to download functions artifact files');
    }
    protected getOutputLogProgress(context: MCPProjectWizardContext): string {
        return context.includeSampleCode ?
            localize('downloadingSampleCode', 'Downloading {0} sample server code...', nonNullProp(context, 'serverLanguage')) :
            localize('downloadingEssentialFiles', 'Downloading functions artifact files...');
    }

    public priority: number = 12;

    public async execute(context: MCPProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('downloadingSampleCodeExecute', 'Downloading sample code...') });
        let sampleMcpRepoUrl: string;
        const alwaysIncludedFileNames: string[] = [];
        switch (context.serverLanguage) {
            case ProjectLanguage.Python:
                sampleMcpRepoUrl = 'https://aka.ms/mcpSamplePython';
                alwaysIncludedFileNames.push('host.json', 'local.settings.json', '.funcignore');
                break;
            case ProjectLanguage.TypeScript:
                sampleMcpRepoUrl = 'https://aka.ms/mcpSampleTypeScript';
                alwaysIncludedFileNames.push('host.json', 'local.settings.json', '.funcignore');
                break;
            case ProjectLanguage.CSharp:
                sampleMcpRepoUrl = 'https://aka.ms/mcpSampleCSharp';
                alwaysIncludedFileNames.push('host.json', 'local.settings.json');
                break;
            default:
                throw new Error(localize('unsupportedLanguage', 'Unsupported language for sample code: {0}', context.serverLanguage));
        }

        const sampleFiles: GitHubFileMetadata[] = await feedUtils.getJsonFeed(context, sampleMcpRepoUrl);
        if (context.includeSampleCode) {
            await this.downloadFilesRecursively(context, sampleFiles, context.projectPath);
        } else {
            for (const fileName of alwaysIncludedFileNames) {
                const file = sampleFiles.find(f => f.name === fileName);
                if (file) {
                    const destinationPath = path.join(context.projectPath, fileName);
                    await this.downloadSingleFile(context, file.download_url, destinationPath);
                }
            }
        }
    }

    private async downloadFilesRecursively(context: MCPProjectWizardContext, items: GitHubFileMetadata[], basePath: string): Promise<void> {
        for (const item of items) {
            if (item.type === 'file') {
                // Download file content
                // not a JSON so this is throwing errors:
                const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: item.download_url });
                const fileContent = response.bodyAsText;
                const filePath: string = path.join(basePath, item.name);
                await AzExtFsExtra.writeFile(filePath, fileContent ?? '');
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

    private async downloadSingleFile(context: MCPProjectWizardContext, fileUrl: string, destinationPath: string): Promise<void> {
        const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: fileUrl });
        const fileContent = response.bodyAsText;
        await AzExtFsExtra.writeFile(destinationPath, fileContent ?? '');
    }

    public shouldExecute(_context: MCPProjectWizardContext): boolean {
        // this should always execute, but depending on context.includeSampleCode,
        // the whole repo or just function artifacts (host.json, local.settings.json, etc.)
        return true;
    }
}
