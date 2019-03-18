/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Progress } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { removeLanguageFromId } from "../../../templates/TemplateProvider";
import { parseJavaClassName } from "../../../utils/javaNameUtils";
import { mavenUtils } from "../../../utils/mavenUtils";
import { nonNullProp } from '../../../utils/nonNull';
import { IJavaFunctionWizardContext } from './IJavaFunctionWizardContext';

export function getNewJavaFunctionFilePath(functionAppPath: string, packageName: string, functionName: string): string {
    return path.join(functionAppPath, 'src', 'main', 'java', ...packageName.split('.'), `${parseJavaClassName(functionName)}.java`);
}

export class JavaFunctionCreateStep extends AzureWizardExecuteStep<IJavaFunctionWizardContext> {
    public async execute(wizardContext: IJavaFunctionWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await mavenUtils.validateMavenInstalled(wizardContext.actionContext, wizardContext.functionAppPath);
        progress.report({ message: localize('creatingFunction', 'Creating {0}...', wizardContext.template.name) });

        const args: string[] = [];
        for (const setting of wizardContext.template.userPromptedSettings) {
            // tslint:disable-next-line: strict-boolean-expressions no-unsafe-any
            args.push(mavenUtils.formatMavenArg(`D${setting.name}`, wizardContext[setting.name] || ''));
        }

        const packageName: string = nonNullProp(wizardContext, 'packageName');
        const functionName: string = nonNullProp(wizardContext, 'functionName');
        await mavenUtils.executeMvnCommand(
            wizardContext.actionContext.properties,
            ext.outputChannel,
            wizardContext.functionAppPath,
            'azure-functions:add',
            '-B',
            mavenUtils.formatMavenArg('Dfunctions.package', packageName),
            mavenUtils.formatMavenArg('Dfunctions.name', functionName),
            mavenUtils.formatMavenArg('Dfunctions.template', removeLanguageFromId(wizardContext.template.id)),
            ...args
        );

        wizardContext.newFilePath = getNewJavaFunctionFilePath(wizardContext.functionAppPath, packageName, functionName);
    }

    public shouldExecute(wizardContext: IJavaFunctionWizardContext): boolean {
        return !wizardContext.newFilePath;
    }
}
