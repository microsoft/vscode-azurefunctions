/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from "vscode-azureextensionui";
import { localize } from "../../../localize";
import { IPythonVenvWizardContext } from "../../createNewProject/pythonSteps/IPythonVenvWizardContext";

export class PythonVenvListStep extends AzureWizardPromptStep<IPythonVenvWizardContext> {
    public hideStepCount: boolean = true;

    private readonly _venvs: string[];

    public constructor(venvs: string[]) {
        super();
        this._venvs = venvs;
    }

    public async prompt(context: IPythonVenvWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<string>[] = this._venvs.map(venv => { return { label: venv, data: venv }; });
        const placeHolder: string = localize('selectVenv', 'Select a virtual environment to use for your project');
        context.venvName = (await context.ui.showQuickPick(picks, { placeHolder, suppressPersistence: true })).data;
    }

    public shouldPrompt(context: IPythonVenvWizardContext): boolean {
        return !!context.useExistingVenv && !context.venvName;
    }
}
