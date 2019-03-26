/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../../extensionVariables';
import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { removeLanguageFromId } from "../../../templates/TemplateProvider";
import { mavenUtils } from "../../../utils/mavenUtils";
import { nonNullProp } from '../../../utils/nonNull';
import { getJavaFunctionFilePath, IJavaProjectWizardContext } from '../../createNewProject/javaSteps/IJavaProjectWizardContext';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export class JavaFunctionCreateStep extends FunctionCreateStepBase<IFunctionWizardContext & IJavaProjectWizardContext> {
    private constructor() {
        super();
    }

    public static async createStep(actionContext: IActionContext): Promise<JavaFunctionCreateStep> {
        await mavenUtils.validateMavenInstalled(actionContext);
        return new JavaFunctionCreateStep();
    }

    public async executeCore(wizardContext: IFunctionWizardContext & IJavaProjectWizardContext): Promise<string> {
        const template: IFunctionTemplate = nonNullProp(wizardContext, 'functionTemplate');

        const args: string[] = [];
        for (const setting of template.userPromptedSettings) {
            // tslint:disable-next-line: strict-boolean-expressions no-unsafe-any
            args.push(mavenUtils.formatMavenArg(`D${setting.name}`, wizardContext[setting.name] || ''));
        }

        const packageName: string = nonNullProp(wizardContext, 'javaPackageName');
        const functionName: string = nonNullProp(wizardContext, 'functionName');
        await mavenUtils.executeMvnCommand(
            wizardContext.actionContext.properties,
            ext.outputChannel,
            wizardContext.projectPath,
            'azure-functions:add',
            '-B',
            mavenUtils.formatMavenArg('Dfunctions.package', packageName),
            mavenUtils.formatMavenArg('Dfunctions.name', functionName),
            mavenUtils.formatMavenArg('Dfunctions.template', removeLanguageFromId(template.id)),
            ...args
        );

        return getJavaFunctionFilePath(wizardContext.projectPath, packageName, functionName);
    }
}
