/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { QuickPickOptions } from 'vscode';
import { nodeProgrammingModelSetting } from '../../constants';
import { localize } from '../../localize';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { IProjectWizardContext } from './IProjectWizardContext';

type ProgrammingModel = { model: number | undefined, label: string };
export class NewProjectModelStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;
    private _models: ProgrammingModel[] = [];

    public constructor(models: ProgrammingModel | ProgrammingModel[]) {
        super();
        this._models = Array.isArray(models) ? models : [models];
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        const modelsPick: IAzureQuickPickItem<number | undefined>[] = this._models.map(model => {
            return {
                label: model.label,
                data: model.model
            }
        });

        const options: QuickPickOptions = { placeHolder: localize('selectLanguage', 'Select a {0} programming model', context.language) };
        const result = (await context.ui.showQuickPick(modelsPick, options)).data;

        context.languageModel = result;
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        // this only impacts node.js for now so only check the feature flag for node.js
        return context.languageModel === undefined && !!getWorkspaceSetting(nodeProgrammingModelSetting);
    }
}
