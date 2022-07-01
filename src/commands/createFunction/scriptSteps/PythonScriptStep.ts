/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions } from '@microsoft/vscode-azext-utils';
import { FunctionLocation, IPythonFunctionWizardContext } from './IPythonFunctionWizardContext';
import { localize } from '../../../localize';

type FileInfo = { path: string, stat: fse.Stats };

async function getFileInfo(path: string): Promise<FileInfo> {
    const stat = await fse.stat(path);

    return {
        path,
        stat
    };
}

async function getDirectoryInfo(directory: string): Promise<FileInfo[]> {
    const files = await fse.readdir(directory);

    return Promise.all(
        files.map(file => getFileInfo(path.join(directory, file))));
}

export class PythonScriptStep extends AzureWizardPromptStep<IPythonFunctionWizardContext> {
    public async prompt(wizardContext: IPythonFunctionWizardContext): Promise<void> {
        const files = await getDirectoryInfo(wizardContext.projectPath);
        const scripts = files.filter(file => file.stat.isFile() && path.extname(file.path) === '.py');

        const filePicks: IAzureQuickPickItem<string>[] = scripts.map(file => ({ label: path.basename(file.path), data: file.path }));

        const fileOptions: IAzureQuickPickOptions = { placeHolder: localize('selectScript', 'Select a script in which to append the function') };

        const fileOption = await wizardContext.ui.showQuickPick(filePicks, fileOptions);

        wizardContext.functionScript = fileOption.data;
    }

    public shouldPrompt(wizardContext: IPythonFunctionWizardContext): boolean {
        return wizardContext.functionLocation === FunctionLocation.SelectedScript
            && wizardContext.functionScript === undefined;
    }
}
