/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullValue, openUrl, type IAzureQuickPickItem, type IAzureQuickPickOptions } from '@microsoft/vscode-azext-utils';
import { FuncVersion } from '../../FuncVersion';
import { recommendedDescription } from '../../constants-nls';
import { localize } from '../../localize';
import { getTemplateVersionFromLanguageAndModel } from '../../utils/templateVersionUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type IProjectWizardContext } from './IProjectWizardContext';

export class ProgrammingModelStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;
    private _options: ProgrammingModelStepOptions;

    public constructor(options: ProgrammingModelStepOptions) {
        super();
        this._options = options
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        // duplicate the array so we don't modify the original
        const modelsPick: IAzureQuickPickItem<number | undefined>[] = this._options.models.slice();

        // add the description to default model
        if (this._options.defaultModel !== undefined) {
            const defaultModel = modelsPick.find(p => p.data === this._options.defaultModel);
            if (defaultModel) {
                defaultModel.description = recommendedDescription;
            }
        }

        const learnMoreQp = { label: localize('learnMore', '$(link-external) Learn more about programming models...'), description: '', data: undefined };
        if (this._options.learnMoreLink) {
            modelsPick.push(learnMoreQp);
        }

        const options: IAzureQuickPickOptions = {
            placeHolder: localize('selectLanguage', 'Select a {0} programming model', context.language),
            suppressPersistence: true,
            learnMoreLink: this._options.learnMoreLink
        };

        let result: IAzureQuickPickItem<number | undefined>;
        do {
            result = (await context.ui.showQuickPick(modelsPick, options));
            if (result === learnMoreQp) {
                await openUrl(nonNullValue(this._options.learnMoreLink));
            }
        }
        while (result === learnMoreQp);

        context.languageModel = result.data;
        context.templateSchemaVersion = getTemplateVersionFromLanguageAndModel(context.language, context.languageModel);
    }

    public async configureBeforePrompt(context: IProjectWizardContext): Promise<void> {
        // auto-select the default model if there is only one
        if (this._options.models.length === 1) {
            context.languageModel = this._options.models[0].data;
        } else if (this._options.defaultModel !== undefined && !getWorkspaceSetting("allowProgrammingModelSelection")) {
            context.languageModel = this._options.defaultModel;
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

interface ProgrammingModelStepOptions {
    models: IAzureQuickPickItem<number | undefined>[],
    defaultModel?: number,
    learnMoreLink?: string,
    isProjectWizard?: boolean;
}

