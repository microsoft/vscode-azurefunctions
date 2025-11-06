/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type Progress } from 'vscode';
import { type GitHubFileMetadata } from '../../../constants';
import { localize } from "../../../localize";
import { feedUtils } from '../../../utils/feedUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { parseJson } from '../../../utils/parseJson';
import { requestUtils } from '../../../utils/requestUtils';
import { type MCPProjectWizardContext } from '../IProjectWizardContext';

export class MCPDownloadSampleCodeExecuteStep extends AzureWizardExecuteStepWithActivityOutput<MCPProjectWizardContext> {
    stepName: string = 'MCPDownloadSampleCodeExecuteStep';
    protected getTreeItemLabel(context: MCPProjectWizardContext): string {
        return localize('downloadSampleCode', 'Downloading {0} sample server code', nonNullProp(context, 'serverLanguage'));
    }
    protected getOutputLogSuccess(context: MCPProjectWizardContext): string {
        return localize('downloadSampleCodeSuccess', 'Successfully downloaded {0} sample server code"', nonNullProp(context, 'serverLanguage'));
    }
    protected getOutputLogFail(context: MCPProjectWizardContext): string {
        return localize('downloadSampleCodeFail', 'Failed to download {0} sample server code', nonNullProp(context, 'serverLanguage'));
    }
    protected getOutputLogProgress(context: MCPProjectWizardContext): string {
        return localize('downloadingSampleCode', 'Downloading {0} sample server code...', nonNullProp(context, 'serverLanguage'));
    }

    public priority: number = 12;

    public async execute(context: MCPProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('downloadingSampleCodeExecute', 'Downloading sample code...') });
        // TODO: change this to aka.ms link when samples repo is available, this is a placeholder
        const sampleFilesUrl =
            'https://api.github.com/repos/Azure-Samples/mcp-sdk-functions-hosting-python/contents';
        const sampleFiles: GitHubFileMetadata[] = await feedUtils.getJsonFeed(context, sampleFilesUrl);
        await this.downloadFilesRecursively(context, sampleFiles, context.projectPath);
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

    public shouldExecute(context: MCPProjectWizardContext): boolean {
        return !!context.includeSampleCode;
    }
}
