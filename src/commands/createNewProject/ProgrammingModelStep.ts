/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions, nonNullValue, openUrl } from '@microsoft/vscode-azext-utils';
import { learnMoreQp, nodeProgrammingModelSetting } from '../../constants';
import { localize } from '../../localize';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { IProjectWizardContext } from './IProjectWizardContext';

type ProgrammingModel = { modelVersion: number | undefined, label: string };
export class ProgrammingModelStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;
    private _models: ProgrammingModel[] = [];
    private _learnMoreLink: string | undefined;

    public constructor(options: { models: ProgrammingModel | ProgrammingModel[], learnMoreLink?: string }) {
        super();
        this._models = Array.isArray(options.models) ? options.models : [options.models];
        this._learnMoreLink = options.learnMoreLink;
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        const modelsPick: IAzureQuickPickItem<number | undefined>[] = this._models.map(model => {
            return {
                label: model.label,
                data: model.modelVersion
            }
        });

        if (this._learnMoreLink) {
            modelsPick.push(learnMoreQp);
        }

        const options: IAzureQuickPickOptions = {
            placeHolder: localize('selectLanguage', 'Select a {0} programming model', context.language),
            suppressPersistence: true,
            learnMoreLink: this._learnMoreLink
        };

        let result: IAzureQuickPickItem<number | undefined>;
        do {
            result = (await context.ui.showQuickPick(modelsPick, options));
            if (result === learnMoreQp) {
                await openUrl(nonNullValue(this._learnMoreLink));
            }
        }
        while (result === learnMoreQp);

        context.languageModel = result.data;
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        // auto-select the default model if there is only one
        if (this._models.length === 1) {
            context.languageModel = this._models[0].modelVersion;
        }

        // this only impacts node for now so only check the feature flag for node
        return context.languageModel === undefined &&
            (!!getWorkspaceSetting(nodeProgrammingModelSetting) &&
                (context.language === 'JavaScript' || context.language === 'TypeScript'));
    }
}
