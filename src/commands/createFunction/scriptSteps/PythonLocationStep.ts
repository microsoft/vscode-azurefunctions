/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { pythonFunctionAppFileName } from '../../../constants';
import { localize } from '../../../localize';
import { FunctionSubWizard } from '../FunctionSubWizard';
import { FunctionLocation, IPythonFunctionWizardContext } from './IPythonFunctionWizardContext';
import { PythonFunctionCreateStep } from './PythonFunctionCreateStep';

export class PythonLocationStep extends AzureWizardPromptStep<IPythonFunctionWizardContext> {
    private readonly _functionSettings: { [key: string]: string | undefined };
    private readonly _isProjectWizard: boolean;

    public constructor(functionSettings: { [key: string]: string | undefined } | undefined, isProjectWizard?: boolean) {
        super();
        this._functionSettings = functionSettings || {};
        this._isProjectWizard = !!isProjectWizard;
    }

    public async prompt(wizardContext: IPythonFunctionWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<FunctionLocation>[] = [
            { label: localize('appendToMainScript', 'Append to {0} (Recommended)', pythonFunctionAppFileName), data: FunctionLocation.MainScript },
            { label: localize('appendToSelectedScript', 'Append to selected file...'), data: FunctionLocation.SelectedScript },
            { label: localize('viewTemplate', 'Preview template'), data: FunctionLocation.Document }
        ];

        const options: IAzureQuickPickOptions = { placeHolder: localize('selectLocation', 'Select a location for the function') };

        const option = await wizardContext.ui.showQuickPick(picks, options);

        wizardContext.functionLocation = option.data;

        if (wizardContext.functionLocation === FunctionLocation.MainScript
            && wizardContext.functionScript === undefined) {
            wizardContext.functionScript = pythonFunctionAppFileName;
        }
    }

    public async getSubWizard(wizardContext: IPythonFunctionWizardContext): Promise<IWizardOptions<IPythonFunctionWizardContext> | undefined> {
        if (wizardContext.functionLocation === FunctionLocation.Document) {
            return {
                executeSteps: [new PythonFunctionCreateStep()]
            };
        } else {
            return await FunctionSubWizard.createSubWizard(wizardContext, this._functionSettings);
        }
    }

    public async configureBeforePrompt(wizardContext: IPythonFunctionWizardContext): Promise<void> {
        // if this is a project wizard, we need to set the functionScript to the default value of 'function_app.py'
        if (this._isProjectWizard && wizardContext.functionScript === undefined) {
            wizardContext.functionScript = pythonFunctionAppFileName;
        }
    }

    public shouldPrompt(wizardContext: IPythonFunctionWizardContext): boolean {
        // don't give the user the option to "append" if this is from project creation
        return wizardContext.functionLocation === undefined && !this._isProjectWizard;
    }
}
