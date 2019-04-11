/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { FunctionConfig } from '../../FunctionConfig';
import { localize } from '../../localize';
import { StringPromptStep } from '../createFunction/genericSteps/StringPromptStep';
import { IBindingWizardContext } from './IBindingWizardContext';

export class BindingNameStep extends StringPromptStep {
    private _functionConfig: FunctionConfig | undefined;

    public async getDefaultValue(wizardContext: IBindingWizardContext): Promise<string | undefined> {
        const defaultValue: string | undefined = await super.getDefaultValue(wizardContext);
        if (defaultValue) {
            let uniqueValue: string = defaultValue;

            let count: number = 1;
            const maxTries: number = 1000;
            while (count < maxTries) {
                if (!await this.bindingExists(wizardContext, uniqueValue)) {
                    return uniqueValue;
                } else {
                    count += 1;
                    uniqueValue = defaultValue + count.toString();
                }
            }
        }

        return defaultValue;
    }

    public async validateInput(wizardContext: IBindingWizardContext, val: string | undefined): Promise<string | undefined> {
        if (!val) {
            return localize('emptyTemplateNameError', 'The binding name cannot be empty.');
        } else if (await this.bindingExists(wizardContext, val)) {
            return localize('existingBindingError', 'A binding with the name "{0}" already exists.', val);
        } else {
            return await super.validateInput(wizardContext, val);
        }
    }

    private async bindingExists(wizardContext: IBindingWizardContext, val: string): Promise<boolean> {
        try {
            if (!this._functionConfig) {
                this._functionConfig = new FunctionConfig(await fse.readJSON(wizardContext.functionJsonPath));
            }

            return !!this._functionConfig.bindings.find(b => b.name === val);
        } catch {
            // If we can't parse the function.json file, we will prompt to overwrite the file later and can assume the binding doesn't exist
            return false;
        }
    }
}
