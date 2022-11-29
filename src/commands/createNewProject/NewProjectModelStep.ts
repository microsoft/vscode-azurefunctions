/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { QuickPickOptions } from 'vscode';
import { nodeProgrammingModelSetting, ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { isNodeV4Plus } from '../../utils/pythonUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { IProjectWizardContext } from './IProjectWizardContext';
import { JavaScriptProjectCreateStep } from './ProjectCreateStep/JavaScriptProjectCreateStep';
import { NodeProgrammingModelProjectCreateStep } from './ProjectCreateStep/NodeProgrammingModelProjectCreateStep';
import { TypeScriptProjectCreateStep } from './ProjectCreateStep/TypeScriptProjectCreateStep';

export type ProgrammingModel = {
    modelVersion: number,
    label: string
}
export class NewProjectModelStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;
    private _models: ProgrammingModel[] = [];

    public constructor(models: ProgrammingModel | ProgrammingModel[]) {
        super();
        this._models = Array.isArray(models) ? models : [models];
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        // Only display 'supported' languages that can be debugged in VS Code
        const modelsPick: IAzureQuickPickItem<number | undefined>[] = this._models.map(model => {
            return {
                label: model.label,
                data: model.modelVersion
            }
        });

        modelsPick.push({ label: 'Default', data: undefined });

        const options: QuickPickOptions = { placeHolder: localize('selectLanguage', 'Select a programming model') };
        const result = (await context.ui.showQuickPick(modelsPick, options)).data;

        context.languageModel = result;
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return context.languageModel === undefined && !!getWorkspaceSetting(nodeProgrammingModelSetting);
    }

    public async getSubWizard(context: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext> | undefined> {
        const executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[] = [];
        if (isNodeV4Plus(context.language, context.languageModel)) {
            executeSteps.push(new NodeProgrammingModelProjectCreateStep)
        } else {
            executeSteps.push(
                context.language === ProjectLanguage.TypeScript ?
                    new TypeScriptProjectCreateStep() :
                    new JavaScriptProjectCreateStep());

        }

        return { executeSteps };
    }
}
