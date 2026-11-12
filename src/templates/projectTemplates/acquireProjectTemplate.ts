/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { gitUtils } from '../../utils/gitUtils';
import { requestUtils } from '../../utils/requestUtils';
import { extractZip } from '../../utils/zipUtils';
import { cloneProjectTemplate } from './cloneProjectTemplate';
import { type IProjectTemplate } from './IProjectTemplate';

export type ProjectTemplateDownloadMethod = 'git' | 'zip';

export interface AcquiredProjectTemplate {
    method: ProjectTemplateDownloadMethod;
    /** The template's project folder, or undefined when the manifest folder is missing or outside the repository. */
    folder: string | undefined;
}

/**
 * Downloads a template repository into `destination`, cloning with git when it is installed and otherwise
 * extracting the GitHub archive, then resolves the template folder (`folderPath`, legacy `subdirectory`, or root).
 * `onDownload` is called with the chosen method before the download starts.
 */
export async function acquireProjectTemplate(
    context: IActionContext,
    template: Pick<IProjectTemplate, 'repositoryUrl' | 'gitRef' | 'branch' | 'folderPath' | 'subdirectory'>,
    destination: string,
    onDownload?: (method: ProjectTemplateDownloadMethod) => void,
): Promise<AcquiredProjectTemplate> {
    const pinnedRef = template.gitRef?.trim();
    const ref = pinnedRef || template.branch?.trim() || 'main';
    const method: ProjectTemplateDownloadMethod = await gitUtils.isGitInstalled(path.dirname(destination)) ? 'git' : 'zip';
    onDownload?.(method);
    if (method === 'git') {
        await cloneProjectTemplate(template.repositoryUrl, ref, destination, template.folderPath);
    } else {
        // Manifest pins (commit SHAs, tags) and qualified refs are archived as-is; bare branch names need refs/heads/.
        const archiveRef = (pinnedRef || ref.startsWith('refs/')) ? ref : `refs/heads/${ref}`;
        const repositoryUrl = template.repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
        await downloadArchive(context, `${repositoryUrl}/archive/${archiveRef}.zip`, destination);
    }
    return { method, folder: await resolveTemplateFolder(template, destination) };
}

async function downloadArchive(context: IActionContext, url: string, destination: string): Promise<void> {
    const archivePath = `${destination}.zip`;
    const extractionPath = `${destination}.extracted`;
    try {
        try {
            await requestUtils.downloadFile(context, url, archivePath, requestUtils.allowCrossOriginRedirectsOptions);
        } catch (error) {
            throw new Error(localize('zipDownloadFailed', 'Failed to download template zip: {0}', parseError(error).message), { cause: error });
        }
        await extractZip(archivePath, extractionPath);
        // GitHub archives contain a single top-level folder named after the repository and ref.
        const entries = await AzExtFsExtra.readDirectory(extractionPath);
        if (entries.length !== 1 || entries[0].type !== vscode.FileType.Directory) {
            throw new Error(localize('projectTemplateArchiveInvalid', 'The project template archive has an unexpected layout.'));
        }
        await AzExtFsExtra.copy(path.join(extractionPath, entries[0].name), destination, { overwrite: false });
    } finally {
        for (const temporaryPath of [archivePath, extractionPath]) {
            try {
                if (await AzExtFsExtra.pathExists(temporaryPath)) {
                    await AzExtFsExtra.deleteResource(temporaryPath, { recursive: true, useTrash: false });
                }
            } catch {
                // Best-effort cleanup of temporary download files.
            }
        }
    }
}

async function resolveTemplateFolder(
    template: Pick<IProjectTemplate, 'folderPath' | 'subdirectory'>,
    repositoryPath: string,
): Promise<string | undefined> {
    const relative = template.folderPath && template.folderPath !== '.' ? template.folderPath : template.subdirectory || '.';
    const folder = path.resolve(repositoryPath, relative);
    const normalized = path.relative(repositoryPath, folder);
    if (normalized === '..' || normalized.startsWith(`..${path.sep}`) || path.isAbsolute(normalized) || !await AzExtFsExtra.pathExists(folder)) {
        return undefined;
    }
    return folder;
}
