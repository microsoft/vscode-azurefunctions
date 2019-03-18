/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { functionNameInvalidMessage, functionNameRegex } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import * as fsUtil from '../../../utils/fs';
import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';

export class ScriptFunctionNameStep extends AzureWizardPromptStep<IScriptFunctionWizardContext> {
    public async prompt(wizardContext: IScriptFunctionWizardContext): Promise<void> {
        const defaultFunctionName: string | undefined = await fsUtil.getUniqueFsPath(wizardContext.functionAppPath, wizardContext.template.defaultFunctionName);
        wizardContext.functionName = await ext.ui.showInputBox({
            placeHolder: localize('funcNamePlaceholder', 'Function name'),
            prompt: localize('funcNamePrompt', 'Provide a function name'),
            validateInput: (s: string): string | undefined => this.validateTemplateName(wizardContext, s),
            value: defaultFunctionName || wizardContext.template.defaultFunctionName
        });
    }

    public shouldPrompt(wizardContext: IScriptFunctionWizardContext): boolean {
        return !wizardContext.functionName;
    }

    private validateTemplateName(wizardContext: IScriptFunctionWizardContext, name: string | undefined): string | undefined {
        if (!name) {
            return localize('emptyTemplateNameError', 'The template name cannot be empty.');
        } else if (fse.existsSync(path.join(wizardContext.functionAppPath, name))) {
            return localize('existingFolderError', 'A folder with the name "{0}" already exists.', name);
        } else if (!functionNameRegex.test(name)) {
            return functionNameInvalidMessage;
        } else {
            return undefined;
        }
    }
}
