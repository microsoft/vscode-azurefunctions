/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, DialogResponses, type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg, type CommandLineCurryFn } from '@microsoft/vscode-processutils';
import * as path from 'path';
import { ProgressLocation, window, type Uri } from "vscode";
import { ProjectLanguage, packageJsonFileName } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { confirmEditJsonFile } from '../../../utils/fs';
import { nonNullProp } from '../../../utils/nonNull';
import { openUrl } from '../../../utils/openUrl';
import { type IJavaProjectWizardContext } from '../../createNewProject/javaSteps/IJavaProjectWizardContext';
import { type IFunctionWizardContext } from "../IFunctionWizardContext";
import { type IDotnetFunctionWizardContext } from '../dotnetSteps/IDotnetFunctionWizardContext';

export class OpenAPICreateStep extends AzureWizardExecuteStep<IFunctionWizardContext> {
    public priority: number = 220;

    public static async createStep(context: IActionContext): Promise<OpenAPICreateStep> {
        await validateAutorestInstalled(context);
        return new OpenAPICreateStep();
    }

    public async execute(wizardContext: IFunctionWizardContext & IJavaProjectWizardContext & IDotnetFunctionWizardContext): Promise<void> {
        const uris: Uri[] = nonNullProp(wizardContext, 'openApiSpecificationFile');
        const uri: Uri = uris[0];

        // TODO: Need to work on this...we don't have a good answer for quoting things that are only a substring of a single argument
        const generalArgsCurryFn = composeArgs(
            withArg(`--input-file:${cpUtils.wrapArgInQuotes(uri.fsPath)}`), // TODO
            withArg(`--version:3.0.6320`),
        );

        let langArgsCurryFn: CommandLineCurryFn;
        switch (wizardContext.language) {
            case ProjectLanguage.TypeScript:
                langArgsCurryFn = composeArgs(
                    withArg('--azure-functions-typescript'),
                    withArg('--no-namespace-folders:True'),
                );
                break;
            case ProjectLanguage.CSharp:
                langArgsCurryFn = composeArgs(
                    withArg(`--namespace:${nonNullProp(wizardContext, 'namespace')}`),
                    withArg('--azure-functions-csharp'),
                );
                break;
            case ProjectLanguage.Java:
                langArgsCurryFn = composeArgs(
                    withArg(`--namespace:${nonNullProp(wizardContext, 'javaPackageName')}`),
                    withArg('--azure-functions-java'),
                );
                break;
            case ProjectLanguage.Python:
                langArgsCurryFn = composeArgs(
                    withArg('--azure-functions-python'),
                    withArg('--no-namespace-folders:True'),
                    withArg('--no-async'),
                );
                break;
            default:
                throw new Error(localize('notSupported', 'Not a supported language. We currently support C#, Java, Python, and Typescript'));
        }

        const args = composeArgs(
            generalArgsCurryFn,
            langArgsCurryFn,
            withArg('--generate-metadata:false'),
            withArg(`--output-folder:${cpUtils.wrapArgInQuotes(wizardContext.projectPath)}`), // TODO
        )();

        ext.outputChannel.appendLog(localize('statutoryWarning', 'Using the plugin could overwrite your custom changes to the functions.\nIf autorest fails, you can run the script on your command-line, or try resetting autorest (autorest --reset) and try again.'));
        const title: string = localize('generatingFunctions', 'Generating from OpenAPI...Check [output window](command:{0}) for status.', ext.prefix + '.showOutputChannel');

        await window.withProgress({ location: ProgressLocation.Notification, title }, async () => {
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'autorest', args);
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
        await cpUtils.executeCommand(undefined, undefined, 'autorest', composeArgs(withArg('--version'))());
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
