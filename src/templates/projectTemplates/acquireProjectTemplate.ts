/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType } from 'vscode';
import { localize } from '../../localize';
import { requestUtils } from '../../utils/requestUtils';
import { extractZip } from '../../utils/zipUtils';
import { cloneProjectTemplate } from './cloneProjectTemplate';
import { type IProjectTemplate } from './IProjectTemplate';

type DownloadArchive = (context: IActionContext, repositoryUrl: string, branch: string, destination: string) => Promise<void>;

export async function acquireProjectTemplateRepository(
    context: IActionContext,
    repositoryUrl: string,
    branch: string,
    destination: string,
    options: { gitInstalled: boolean; checkoutFolder?: string; downloadArchive?: DownloadArchive },
): Promise<void> {
    if (options.gitInstalled) {
        await cloneProjectTemplate(repositoryUrl, branch, destination, options.checkoutFolder);
    } else {
        await (options.downloadArchive ?? downloadProjectTemplateArchive)(context, repositoryUrl, branch, destination);
    }
}

export async function downloadProjectTemplateArchive(
    context: IActionContext,
    repositoryUrl: string,
    branch: string,
    destination: string,
): Promise<void> {
    const archiveRef = branch.startsWith('refs/') ? branch : `refs/heads/${branch}`;
    const base = repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
    const archivePath = `${destination}.zip`;
    const extractionPath = `${destination}.extracted`;
    try {
        await requestUtils.downloadFile(context, `${base}/archive/${archiveRef}.zip`, archivePath, requestUtils.allowCrossOriginRedirectsOptions);
        await AzExtFsExtra.ensureDir(extractionPath);
        await extractZip(archivePath, extractionPath);
        const entries = await AzExtFsExtra.readDirectory(extractionPath);
        if (entries.length !== 1 || entries[0].type !== FileType.Directory) {
            throw new Error(localize('projectTemplateArchiveInvalid', 'The project template archive has an unexpected layout.'));
        }
        await AzExtFsExtra.copy(path.join(extractionPath, entries[0].name), destination, { overwrite: false });
    } finally {
        for (const temporaryPath of [archivePath, extractionPath]) {
            if (await AzExtFsExtra.pathExists(temporaryPath)) {
                await AzExtFsExtra.deleteResource(temporaryPath, { recursive: true, useTrash: false });
            }
        }
    }
}

export async function resolveProjectTemplateFolder(
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
