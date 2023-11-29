/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import { nonNullProp } from '../../../utils/nonNull';
import { getJavaFunctionFilePath, type IJavaProjectWizardContext } from '../../createNewProject/javaSteps/IJavaProjectWizardContext';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting, type IFunctionWizardContext } from '../IFunctionWizardContext';
import { type IJavaFunctionTemplate, type IJavaFunctionWizardContext } from './IJavaFunctionWizardContext';

export class JavaFunctionCreateStep extends FunctionCreateStepBase<IFunctionWizardContext & IJavaProjectWizardContext> {

    public async executeCore(context: IJavaFunctionWizardContext & IJavaProjectWizardContext): Promise<string> {
        const template: IJavaFunctionTemplate = nonNullProp(context, 'functionTemplate');
        const packageName: string = nonNullProp(context, 'javaPackageName');
        const functionName: string = nonNullProp(context, 'functionName');

        const args: Map<string, string> = new Map<string, string>();
        for (const setting of template.userPromptedSettings) {
            const value = getBindingSetting(context, setting);
            // NOTE: Explicitly checking against undefined. Empty string is a valid value
            if (value !== undefined) {
                const fixedValue: string = setting.valueType === 'enum' ? String(value).toUpperCase() : String(value);
                args.set(setting.name, fixedValue);
            }
        }
        args.set("packageName", packageName);
        args.set("functionName", functionName);
        args.set("className", functionName.replace('-', '_'));
        const content: string = substituteParametersInTemplate(template, args);
        const path: string = getJavaFunctionFilePath(context.projectPath, packageName, functionName);
        await AzExtFsExtra.ensureFile(path);
        await AzExtFsExtra.writeFile(path, content);
        return getJavaFunctionFilePath(context.projectPath, packageName, functionName);
    }
}

function substituteParametersInTemplate(template: IJavaFunctionTemplate, args: Map<string, string>): string {
    let javaTemplate = template.templateFiles["function.java"];
    args.forEach((value: string, key: string) => {
        javaTemplate = javaTemplate.replace(new RegExp(`\\$${key}\\$`, 'g'), value);
    });
    return javaTemplate;
}
