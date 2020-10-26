/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { ProgressLocation, Uri, window } from "vscode";
import { AzureWizardExecuteStep, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage, requirementsFileName } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { confirmEditJsonFile, confirmOverwriteFile } from '../../../utils/fs';
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
                const message: string = localize('autorestNotRunSuccessfully',
                    `Failed to run "autorest.${pluginRunPrefix}-${pluginRun}" | Click "Report an Issue" to report the error.`);
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
                await addAutorestSpecificTypescriptDependencies(wizardContext);
                break;
            case ProjectLanguage.Python:
                await addAutorestSpecificPythonDependencies(wizardContext);
                break;
            default:
                break;
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

async function addAutorestSpecificTypescriptDependencies(context: IFunctionWizardContext): Promise<void> {
    const coreHttp: string = '@azure/core-http';
    const coreHttpVersion: string = '^1.1.4';
    const packagePath: string = path.join(context.projectPath, 'package.json');

    await confirmEditJsonFile(packagePath, (data: { devDependencies?: { [key: string]: string } }): {} => {
        // tslint:disable-next-line: strict-boolean-expressions
        data.devDependencies = data.devDependencies || {};
        if (!data.devDependencies[coreHttp]) {
            data.devDependencies[coreHttp] = coreHttpVersion;
        }
        return data;
    });
}

async function addAutorestSpecificPythonDependencies(context: IFunctionWizardContext): Promise<void> {

    let oldRequirements: string = '';
    let newRequirements: string = '';
    const requirementsPath: string = path.join(context.projectPath, requirementsFileName);

    // Current list of dependencies to be added to support stencil generated projects.
    const dependenciesToAddArray: string[] = ['msrest'];

    // Some custom requirements might not have newline character added already.
    const dependenciesToAdd: string = `\n${dependenciesToAddArray.join('\n')}\n`;

    if (await fse.pathExists(requirementsPath)) {
        try {
            oldRequirements = (await fse.readFile(requirementsPath)).toString();
            newRequirements = oldRequirements.concat(dependenciesToAdd);
        } catch (error) {
            // If we failed to parse or edit the existing file, just ask to overwrite the file completely
            if (await confirmOverwriteFile(requirementsPath)) {
                newRequirements = dependenciesToAdd;
            } else {
                return;
            }
        }
    } else {
        newRequirements = dependenciesToAdd;
    }
    await fse.writeFile(requirementsPath, newRequirements);
}
