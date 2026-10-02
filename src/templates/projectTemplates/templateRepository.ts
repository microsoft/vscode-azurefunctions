/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType } from 'vscode';
import { cpUtils } from '../../utils/cpUtils';
import { type IProjectTemplate } from './IProjectTemplate';

type TemplateRepository = Pick<IProjectTemplate, 'repositoryUrl' | 'gitRef' | 'branch' | 'folderPath' | 'subdirectory'>;

export function getTemplateGitRef(template: Pick<IProjectTemplate, 'gitRef' | 'branch'>): string {
    return template.gitRef || `refs/heads/${template.branch || 'main'}`;
}

export function getTemplateFolder(template: Pick<IProjectTemplate, 'folderPath' | 'subdirectory'>): string | undefined {
    return template.folderPath && template.folderPath !== '.' ? template.folderPath : template.subdirectory || undefined;
}

function encodePath(value: string): string {
    return value.split('/').map(encodeURIComponent).join('/');
}

export function getTemplateArchiveUrl(template: TemplateRepository): string {
    const base = template.repositoryUrl.replace(/\/$/, '').replace(/\.git$/, '');
    return `${base}/archive/${encodePath(getTemplateGitRef(template))}.zip`;
}

export function getTemplateReadmeUrl(template: TemplateRepository): string {
    const base = template.repositoryUrl.replace(/\/$/, '').replace(/\.git$/, '')
        .replace('https://github.com/', 'https://raw.githubusercontent.com/');
    return `${base}/${encodePath(getTemplateGitRef(template))}/README.md`;
}

export async function getTemplateArchiveRoot(directory: string): Promise<string> {
    const entries = await AzExtFsExtra.readDirectory(directory);
    if (entries.length !== 1 || entries[0].type !== FileType.Directory) {
        throw new Error('Template archive must contain a single repository directory');
    }
    return path.join(directory, entries[0].name);
}

export async function cloneTemplateRepository(template: TemplateRepository, destination: string): Promise<void> {
    const folder = getTemplateFolder(template);
    await cpUtils.executeCommand(undefined, undefined, 'git', ['init', destination]);
    await cpUtils.executeCommand(undefined, destination, 'git', ['remote', 'add', 'origin', template.repositoryUrl]);
    // Fetch the exact ref: clone --branch accepts neither qualified refs nor commit SHAs.
    const fetchArgs = ['fetch', '--depth', '1'];
    if (folder) {
        fetchArgs.push('--filter=blob:none');
    }
    await cpUtils.executeCommand(undefined, destination, 'git', [...fetchArgs, 'origin', getTemplateGitRef(template)]);
    if (folder) {
        await cpUtils.executeCommand(undefined, destination, 'git', ['sparse-checkout', 'set', folder]);
    }
    await cpUtils.executeCommand(undefined, destination, 'git', ['checkout', '--detach', 'FETCH_HEAD']);
}
