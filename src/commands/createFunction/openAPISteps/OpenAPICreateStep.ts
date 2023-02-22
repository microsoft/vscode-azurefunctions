/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, DialogResponses, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProgressLocation, Uri, window } from "vscode";
import { packageJsonFileName, ProjectLanguage } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { confirmEditJsonFile } from '../../../utils/fs';
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
        const uris: Uri[] = nonNullProp(wizardContext, 'openApiSpecificationFile');
        const uri: Uri = uris[0];
        const args: string[] = [];

        args.push(`--input-file:${cpUtils.wrapArgInQuotes(uri.fsPath)}`);
        args.push(`--version:3.0.6320`);

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
        }

        args.push('--generate-metadata:false');
        args.push(`--output-folder:${cpUtils.wrapArgInQuotes(wizardContext.projectPath)}`);

        ext.outputChannel.appendLog(localize('statutoryWarning', 'Using the plugin could overwrite your custom changes to the functions.\nIf autorest fails, you can run the script on your command-line, or try resetting autorest (autorest --reset) and try again.'));
        const title: string = localize('generatingFunctions', 'Generating from OpenAPI...Check [output window](command:{0}) for status.', ext.prefix + '.showOutputChannel');

        await window.withProgress({ location: ProgressLocation.Notification, title }, async () => {
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'autorest', ...args);
        });

        if (wizardContext.language === ProjectLanguage.TypeScript) {
            // Change the package.json only when the autorest successfully ran.
            await addAutorestSpecificTypescriptDependencies(wizardContext);
        }
    }

    public shouldExecute(): boolean {
        return true;
    }
}

async function validateAutorestInstalled(context: IActionContext): Promise<void> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'autorest', '--version');
    } catch (error) {
        const message: string = localize('autorestNotFound', 'Failed to find "autorest" | Extension needs AutoRest to generate a function app from an OpenAPI specification. Click "Learn more" for more details on installation steps.');
        if (!context.errorHandling.suppressDisplay) {
            void window.showErrorMessage(message, DialogResponses.learnMore).then(async result => {
                if (result === DialogResponses.learnMore) {
                    await openUrl('https://aka.ms/autorest');
                }
            });
            context.errorHandling.suppressDisplay = true;
        }

        throw new Error(message);
    }
}

async function addAutorestSpecificTypescriptDependencies(context: IFunctionWizardContext): Promise<void> {
    const coreHttp: string = '@azure/core-http';
    const coreHttpVersion: string = '^1.1.4';
    const packagePath: string = path.join(context.projectPath, packageJsonFileName);

    await confirmEditJsonFile(context, packagePath, (data: { devDependencies?: { [key: string]: string } }): {} => {
        data.devDependencies = data.devDependencies || {};
        if (!data.devDependencies[coreHttp]) {
            data.devDependencies[coreHttp] = coreHttpVersion;
        }
        return data;
    });
}
