/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenDialogOptions, ProgressLocation, Uri, window, workspace } from "vscode";
import { AzureWizardExecuteStep, AzureWizardPromptStep, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { nonNullProp } from '../../../utils/nonNull';
import { openUrl } from '../../../utils/openUrl';
import { IJavaProjectWizardContext } from '../../createNewProject/javaSteps/IJavaProjectWizardContext';
import { IDotnetFunctionWizardContext } from '../dotnetSteps/IDotnetFunctionWizardContext';
import { IFunctionWizardContext } from "../IFunctionWizardContext";

export class OpenAPICreateStep extends AzureWizardExecuteStep<IFunctionWizardContext> {
    public priority: number = 220;

    public static async createStep(context: IActionContext): Promise<OpenAPICreateStep> {
        await validateAutorestInstalled(context);
        return new OpenAPICreateStep();
    }

    public async execute(wizardContext: IFunctionWizardContext & IJavaProjectWizardContext & IDotnetFunctionWizardContext): Promise<void> {
        // const uris: Uri[] = await this.askDocument();
        const uris: Uri[] = nonNullProp(wizardContext, 'openApiSpecificationFile');
        const uri: Uri = uris[0];
        const args: string[] = [];

        args.push(`--input-file:${cpUtils.wrapArgInQuotes(uri.fsPath)} --version:3.0.6320`);

        switch (wizardContext.language) {
            case ProjectLanguage.TypeScript:
                args.push('--azure-functions-typescript');
                args.push('--no-namespace-folders:True');
                break;
            case ProjectLanguage.CSharp:
                args.push(`--namespace:${nonNullProp(wizardContext, 'namespace')}`);
                args.push('--azure-functions-csharp');
                break;
            case ProjectLanguage.Java:
                args.push(`--namespace:${nonNullProp(wizardContext, 'javaPackageName')}`);
                args.push('--azure-functions-java');
                break;
            case ProjectLanguage.Python:
                args.push('--azure-functions-python');
                args.push('--no-namespace-folders:True');
                args.push('--no-async');
                break;
            default:
                throw new Error(localize('notSupported', 'Not a supported language. We currently support C#, Java, Python, and Typescript'));
                break;
        }

        args.push('--generate-metadata:false');
        args.push(`--output-folder:${wizardContext.projectPath}`);

        ext.outputChannel.appendLog(localize('statutoryWarning', 'Using the plugin could overwrite your custom changes to the functions.'));
        const title: string = localize('generatingFunctions', 'Generating from OpenAPI...Check [output window](command:{0}) for status.', ext.prefix + '.showOutputChannel');

        await window.withProgress({ location: ProgressLocation.Notification, title }, async () => {
            await cpUtils.tryExecuteCommand(ext.outputChannel, undefined, 'autorest', ...args);
        });
    }

    public shouldExecute(): boolean {
        return true;
    }
}

export class OpenAPIGetSpecificationFileStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    public async prompt(context: IFunctionWizardContext): Promise<void> {
        const openDialogOptions: OpenDialogOptions = {
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            title: 'Select OpenAPI (v2/v3) Specification File',
            openLabel: 'Specification File',
            filters: {
                JSON: ['json', 'yaml']
            }
        };

        context.openApiSpecificationFile = await ext.ui.showOpenDialog(openDialogOptions);

        if (workspace.workspaceFolders) {
            openDialogOptions.defaultUri = Uri.file(workspace.workspaceFolders[0].uri.toString());
        }
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.javaPackageName;
    }
}

async function validateAutorestInstalled(context: IActionContext): Promise<void> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'autorest', '--version');
    } catch (error) {
        const message: string = localize('autorestNotFound', 'Failed to find "autorest" | Extension needs Autorest to generate Function app from OpenAPI specification. Click "Learn more" for more details for installation steps.');
        if (!context.errorHandling.suppressDisplay) {
            window.showErrorMessage(message, DialogResponses.learnMore).then(async result => {
                if (result === DialogResponses.learnMore) {
                    await openUrl('https://aka.ms/autorest');
                }
            });
            context.errorHandling.suppressDisplay = true;
        }

        throw new Error(message);
    }
}
