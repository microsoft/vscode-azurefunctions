/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions } from '@microsoft/vscode-azext-utils';
import { FunctionLocation, IPythonFunctionWizardContext } from './IPythonFunctionWizardContext';
import { localize } from '../../../localize';

export class PythonScriptStep extends AzureWizardPromptStep<IPythonFunctionWizardContext> {
    public async prompt(wizardContext: IPythonFunctionWizardContext): Promise<void> {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(wizardContext.projectPath));
        const scripts =
            entries
                .filter(entry => entry[1] === vscode.FileType.File && path.extname(entry[0]) === '.py')
                .map(entry => entry[0]);

        const filePicks: IAzureQuickPickItem<string>[] = scripts.map(file => ({ label: path.basename(file), data: file }));

        const fileOptions: IAzureQuickPickOptions = { placeHolder: localize('selectScript', 'Select a script in which to append the function') };

        const fileOption = await wizardContext.ui.showQuickPick(filePicks, fileOptions);

        wizardContext.functionScript = fileOption.data;
    }

    public shouldPrompt(wizardContext: IPythonFunctionWizardContext): boolean {
        return wizardContext.functionLocation === FunctionLocation.SelectedScript
            && wizardContext.functionScript === undefined;
    }
}
