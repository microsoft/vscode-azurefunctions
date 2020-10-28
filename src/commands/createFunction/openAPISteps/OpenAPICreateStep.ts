/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressLocation, Uri, window } from "vscode";
import { AzureWizardExecuteStep, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { nonNullProp } from '../../../utils/nonNull';
import { openUrl } from '../../../utils/openUrl';
import { IJavaProjectWizardContext } from '../../createNewProject/javaSteps/IJavaProjectWizardContext';
import { IDotnetFunctionWizardContext } from '../dotnetSteps/IDotnetFunctionWizardContext';
import { IFunctionWizardContext } from "../IFunctionWizardContext";
import { openApiUtils } from './OpenApiUtils';

export class OpenAPICreateStep extends AzureWizardExecuteStep<IFunctionWizardContext> {
    public priority: number = 220;

    public static async createStep(context: IActionContext & IFunctionWizardContext): Promise<OpenAPICreateStep> {
        await openApiUtils.validateAutorestInstalled(context);

        switch (context.language) {
            case ProjectLanguage.Java:
                await openApiUtils.validateJavaForAutorestInstalled(context);
                break;
            case ProjectLanguage.CSharp:
                await openApiUtils.validateDotnetForAutorestInstalled(context);
                break;
            case ProjectLanguage.Python:
                await openApiUtils.validatePythonForAutorestInstalled(context);
            default:
                break;
        }

        return new OpenAPICreateStep();
    }

    public async execute(wizardContext: IFunctionWizardContext & IJavaProjectWizardContext & IDotnetFunctionWizardContext): Promise<void> {
        const uris: Uri[] = nonNullProp(wizardContext, 'openApiSpecificationFile');
        const uri: Uri = uris[0];
        const args: string[] = [];
        const pluginRunPrefix: string = 'azure-functions';
        let pluginRun: string = '';

        switch (wizardContext.language) {
            case ProjectLanguage.TypeScript:
                pluginRun = 'typescript';
                args.push('--no-namespace-folders:True');
                break;
            case ProjectLanguage.CSharp:
                pluginRun = 'csharp';
                args.push(`--namespace:${nonNullProp(wizardContext, 'namespace')}`);
                break;
            case ProjectLanguage.Java:
                pluginRun = 'java';
                args.push(`--namespace:${nonNullProp(wizardContext, 'javaPackageName')}`);
                break;
            case ProjectLanguage.Python:
                pluginRun = 'python';
                args.push('--no-async');
                args.push('--no-namespace-folders:True');
                break;
            default:
                throw new Error(localize('notSupported', 'Not a supported language. We currently support C#, Java, Python, and Typescript'));
        }

        args.push(`--${pluginRunPrefix}-${pluginRun}`);
        args.push(`--input-file:${cpUtils.wrapArgInQuotes(uri.fsPath)}`);
        args.push(`--output-folder:${cpUtils.wrapArgInQuotes(wizardContext.projectPath)}`);
        args.push('--generate-metadata:false');
        args.push(`--version:3.0.6320`);

        ext.outputChannel.appendLog(localize('statutoryWarning', 'Using the plugin could overwrite your custom changes to the functions.\nIf autorest fails, you can run the script on your command-line, or try resetting autorest (autorest --reset) and try again.'));
        ext.outputChannel.appendLog(localize('urlsForIssues', 'If there are any issues, please visit https://aka.ms/stencil for usage information or report issues at https://aka.ms/stencil/issues.'));
        const title: string = localize('generatingFunctions', 'Generating from OpenAPI Specification...Check [output window](command:{0}) for status.', ext.prefix + '.showOutputChannel');

        await window.withProgress({ location: ProgressLocation.Notification, title }, async () => {
            try {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'autorest', ...args);
            } catch (error) {
                const message: string = localize('autorestNotRunSuccessfully', `Failed to run "autorest.${pluginRunPrefix}-${pluginRun}".`);
                if (!wizardContext.errorHandling.suppressDisplay) {
                    window.showErrorMessage(message, DialogResponses.reportAnIssue).then(async result => {
                        if (result === DialogResponses.reportAnIssue) {
                            await openUrl('https://aka.ms/stencil/issues');
                        }
                    });
                    wizardContext.errorHandling.suppressDisplay = true;
                }

                throw new Error(message);
            }
        });

        switch (wizardContext.language) {
            case ProjectLanguage.TypeScript:
                await openApiUtils.addAutorestSpecificTypescriptDependencies(wizardContext);
                break;
            case ProjectLanguage.Python:
                await openApiUtils.addAutorestSpecificPythonDependencies(wizardContext);
                break;
            default:
                break;
        }
    }

    public shouldExecute(): boolean {
        return true;
    }
}
