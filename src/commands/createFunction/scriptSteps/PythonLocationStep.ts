/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions } from '@microsoft/vscode-azext-utils';
import { FunctionLocation, IPythonFunctionWizardContext } from './IPythonFunctionWizardContext';
import { localize } from '../../../localize';
import { pythonFunctionAppFileName } from '../../../constants';

export class PythonLocationStep extends AzureWizardPromptStep<IPythonFunctionWizardContext> {
    public async prompt(wizardContext: IPythonFunctionWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<FunctionLocation>[] = [
            { label: localize('appendToMainScript', 'Append to {0} (Recommended)', pythonFunctionAppFileName), data: FunctionLocation.MainScript },
            { label: localize('appendToSelectedScript', 'Append to selected file...'), data: FunctionLocation.SelectedScript },
            { label: localize('viewTemplate', 'View template'), data: FunctionLocation.Document }
        ];

        const options: IAzureQuickPickOptions = { placeHolder: localize('selectLocation', 'Select a location for the function') };

        const option = await wizardContext.ui.showQuickPick(picks, options);

        wizardContext.functionLocation = option.data;

        if (wizardContext.functionLocation === FunctionLocation.MainScript
            && wizardContext.functionScript === undefined) {
            wizardContext.functionScript = pythonFunctionAppFileName;
        }
    }

    public shouldPrompt(wizardContext: IPythonFunctionWizardContext): boolean {
        return wizardContext.functionLocation === undefined;
    }
}