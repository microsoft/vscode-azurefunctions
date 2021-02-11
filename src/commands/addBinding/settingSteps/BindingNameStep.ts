/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { ParsedFunctionJson } from '../../../funcConfig/function';
import { localize } from '../../../localize';
import { IBindingWizardContext } from '../IBindingWizardContext';
import { StringPromptStep } from './StringPromptStep';

export class BindingNameStep extends StringPromptStep {
    private _functionJson: ParsedFunctionJson | undefined;

    public async getDefaultValue(context: IBindingWizardContext): Promise<string | undefined> {
        const defaultValue: string | undefined = super.getDefaultValue(context);
        if (defaultValue) {
            let uniqueValue: string = defaultValue;

            let count: number = 1;
            const maxTries: number = 1000;
            while (count < maxTries) {
                if (!await this.bindingExists(context, uniqueValue)) {
                    return uniqueValue;
                } else {
                    count += 1;
                    uniqueValue = defaultValue + count.toString();
                }
            }
        }

        return defaultValue;
    }

    public async validateInput(context: IBindingWizardContext, val: string | undefined): Promise<string | undefined> {
        if (!val) {
            return localize('emptyTemplateNameError', 'The binding name cannot be empty.');
        } else if (await this.bindingExists(context, val)) {
            return localize('existingBindingError', 'A binding with the name "{0}" already exists.', val);
        } else {
            return super.validateInput(context, val);
        }
    }

    private async bindingExists(context: IBindingWizardContext, val: string): Promise<boolean> {
        try {
            if (!this._functionJson) {
                this._functionJson = new ParsedFunctionJson(await fse.readJSON(context.functionJsonPath));
            }

            return !!this._functionJson.bindings.find(b => b.name === val);
        } catch {
            // If we can't parse the function.json file, we will prompt to overwrite the file later and can assume the binding doesn't exist
            return false;
        }
    }
}
