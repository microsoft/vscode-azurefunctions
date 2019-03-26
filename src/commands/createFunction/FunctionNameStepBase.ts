/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { nonNullProp } from '../../utils/nonNull';
import { IFunctionWizardContext } from './IFunctionWizardContext';

export abstract class FunctionNameStepBase<T extends IFunctionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(wizardContext: T): Promise<void> {
        const template: IFunctionTemplate = nonNullProp(wizardContext, 'functionTemplate');
        const uniqueFunctionName: string | undefined = await this.getUniqueFunctionName(wizardContext);
        wizardContext.functionName = await ext.ui.showInputBox({
            placeHolder: localize('funcNamePlaceholder', 'Function name'),
            prompt: localize('funcNamePrompt', 'Provide a function name'),
            validateInput: async (s: string): Promise<string | undefined> => await this.validateFunctionName(wizardContext, s),
            value: uniqueFunctionName || template.defaultFunctionName
        });
    }

    public shouldPrompt(wizardContext: T): boolean {
        return !wizardContext.functionName;
    }

    protected abstract getUniqueFunctionName(wizardContext: T): Promise<string | undefined>;
    protected abstract validateFunctionNameCore(wizardContext: T, name: string): Promise<string | undefined>;

    private async validateFunctionName(wizardContext: T, name: string | undefined): Promise<string | undefined> {
        if (!name) {
            return localize('emptyTemplateNameError', 'The function name cannot be empty.');
        } else if (!/^[a-z][a-z\d_\-]*$/i.test(name)) {
            return localize('functionNameInvalidMessage', 'Function name must start with a letter and can only contain letters, digits, "_" and "-".');
        } else {
            return await this.validateFunctionNameCore(wizardContext, name);
        }
    }
}
