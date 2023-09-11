/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions, nonNullValue, openUrl } from '@microsoft/vscode-azext-utils';
import { FuncVersion } from '../../FuncVersion';
import { recommendedDescription } from '../../constants-nls';
import { localize } from '../../localize';
import { IProjectWizardContext } from './IProjectWizardContext';

export class ProgrammingModelStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;
    private _models: IAzureQuickPickItem<number | undefined>[] = [];
    private _defaultModel?: number;
    private _learnMoreLink: string | undefined;

    public constructor(options: {
        models: IAzureQuickPickItem<number | undefined>[],
        defaultModel?: number,
        learnMoreLink?: string
    }) {
        super();
        this._models = Array.isArray(options.models) ? options.models : [options.models];
        this._defaultModel = options.defaultModel;
        this._learnMoreLink = options.learnMoreLink;
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        // duplicate the array so we don't modify the original
        const modelsPick: IAzureQuickPickItem<number | undefined>[] = this._models.slice();

        // add the description to default model
        if (this._defaultModel !== undefined) {
            const defaultModel = modelsPick.find(p => p.data === this._defaultModel);
            if (defaultModel) {
                defaultModel.description = recommendedDescription;
            }
        }

        const learnMoreQp = { label: localize('learnMore', '$(link-external) Learn more about programming models...'), description: '', data: undefined };
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

    public async configureBeforePrompt(context: IProjectWizardContext): Promise<void> {
        // auto-select the default model if there is only one
        if (this._models.length === 1) {
            context.languageModel = this._models[0].data;
        }
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        // programming model is only supported for v4 runtime
        if (context.version !== FuncVersion.v4) {
            return false;
        }

        // this only impacts python/node for now so only check for those languages
        return context.languageModel === undefined &&
            (context.language === 'JavaScript' || context.language === 'TypeScript' || context.language === 'Python');
    }
}
