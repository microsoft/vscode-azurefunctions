/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../../extensionVariables';
import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { mavenUtils } from "../../../utils/mavenUtils";
import { nonNullProp } from '../../../utils/nonNull';
import { getJavaFunctionFilePath, IJavaProjectWizardContext } from '../../createNewProject/javaSteps/IJavaProjectWizardContext';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting, IFunctionWizardContext } from '../IFunctionWizardContext';

export class JavaFunctionCreateStep extends FunctionCreateStepBase<IFunctionWizardContext & IJavaProjectWizardContext> {
    private constructor() {
        super();
    }

    public static async createStep(context: IActionContext): Promise<JavaFunctionCreateStep> {
        await mavenUtils.validateMavenInstalled(context);
        return new JavaFunctionCreateStep();
    }

    public async executeCore(context: IFunctionWizardContext & IJavaProjectWizardContext): Promise<string> {
        const template: IFunctionTemplate = nonNullProp(context, 'functionTemplate');

        const args: string[] = [];
        for (const setting of template.userPromptedSettings) {
            const value = getBindingSetting(context, setting);
            // NOTE: Explicitly checking against undefined. Empty string is a valid value
            if (value !== undefined) {
                args.push(mavenUtils.formatMavenArg(`D${setting.name}`, value));
            }
        }

        const packageName: string = nonNullProp(context, 'javaPackageName');
        const functionName: string = nonNullProp(context, 'functionName');
        await mavenUtils.executeMvnCommand(
            context.telemetry.properties,
            ext.outputChannel,
            context.projectPath,
            'azure-functions:add',
            '-B',
            mavenUtils.formatMavenArg('Dfunctions.package', packageName),
            mavenUtils.formatMavenArg('Dfunctions.name', functionName),
            mavenUtils.formatMavenArg('Dfunctions.template', removeLanguageFromId(template.id)),
            ...args
        );

        return getJavaFunctionFilePath(context.projectPath, packageName, functionName);
    }
}

function removeLanguageFromId(id: string): string {
    return id.split('-')[0];
}
