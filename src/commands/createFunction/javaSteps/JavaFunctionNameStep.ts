/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { functionNameInvalidMessage, functionNameRegex } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { removeLanguageFromId } from "../../../templates/TemplateProvider";
import * as fsUtil from '../../../utils/fs';
import { getFullClassName } from "../../../utils/javaNameUtils";
import { nonNullProp } from '../../../utils/nonNull';
import { IJavaFunctionWizardContext } from './IJavaFunctionWizardContext';
import { getNewJavaFunctionFilePath } from './JavaFunctionCreateStep';

export class JavaFunctionNameStep extends AzureWizardPromptStep<IJavaFunctionWizardContext> {
    public async prompt(wizardContext: IJavaFunctionWizardContext): Promise<void> {
        const defaultFunctionName: string | undefined = await fsUtil.getUniqueJavaFsPath(wizardContext.functionAppPath, nonNullProp(wizardContext, 'packageName'), `${removeLanguageFromId(wizardContext.template.id)}Java`);
        wizardContext.functionName = await ext.ui.showInputBox({
            placeHolder: localize('funcNamePlaceholder', 'Function name'),
            prompt: localize('funcNamePrompt', 'Provide a function name'),
            validateInput: (s: string): string | undefined => this.validateTemplateName(wizardContext, s),
            value: defaultFunctionName || wizardContext.template.defaultFunctionName
        });
    }

    public shouldPrompt(wizardContext: IJavaFunctionWizardContext): boolean {
        return !wizardContext.functionName;
    }

    private validateTemplateName(wizardContext: IJavaFunctionWizardContext, name: string | undefined): string | undefined {
        const packageName: string = nonNullProp(wizardContext, 'packageName');
        if (!name) {
            return localize('emptyTemplateNameError', 'The template name cannot be empty.');
        } else if (fse.existsSync(getNewJavaFunctionFilePath(wizardContext.functionAppPath, packageName, name))) {
            return localize('existingFolderError', 'The Java class "{0}" already exists.', getFullClassName(packageName, name));
        } else if (!functionNameRegex.test(name)) {
            return functionNameInvalidMessage;
        } else {
            return undefined;
        }
    }
}
