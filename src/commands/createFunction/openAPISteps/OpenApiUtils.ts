/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { EOL } from 'os';
import * as path from 'path';
import { window } from "vscode";
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { requirementsFileName } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { getDotnetInstalled } from "../../../templates/dotnet/executeDotnetTemplateCommand";
import { cpUtils } from "../../../utils/cpUtils";
import { confirmEditJsonFile } from '../../../utils/fs';
import { openUrl } from "../../../utils/openUrl";
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export namespace openApiUtils {
    export async function validateAutorestInstalled(context: IActionContext): Promise<void> {
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

    export async function validateJavaForAutorestInstalled(context: IActionContext): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, undefined, 'java', '--version');
        } catch (error) {
            const message: string = localize('javaForAutorestNotFound', 'Failed to find "java" | Extension needs AutoRest, Java to generate a Java function app from an OpenAPI specification.');
            if (!context.errorHandling.suppressDisplay) {
                window.showErrorMessage(message, DialogResponses.learnMore).then(async result => {
                    if (result === DialogResponses.learnMore) {
                        await openUrl('https://aka.ms/stencil/java');
                    }
                });
                context.errorHandling.suppressDisplay = true;
            }

            throw new Error(message);
        }
    }
    export async function validateDotnetForAutorestInstalled(context: IActionContext): Promise<void> {
        try {
            const installedFramework: string = await getDotnetInstalled(context);

            // https://aka.ms/stencil/csharp only works on dotnet 3.0+
            if (installedFramework !== `netcoreapp3.0`) {
                throw new Error();
            }
        } catch (error) {
            const message: string = localize('csharpForAutorestNotFound', 'You must have the [.NET Core SDK](https://aka.ms/AA4ac70) installed to perform this operation. See [here](https://aka.ms/stencil/csharp) for supported versions.');
            if (!context.errorHandling.suppressDisplay) {
                window.showErrorMessage(message, DialogResponses.learnMore).then(async result => {
                    if (result === DialogResponses.learnMore) {
                        await openUrl('https://aka.ms/stencil/csharp');
                    }
                });
                context.errorHandling.suppressDisplay = true;
            }
            throw new Error(message);
        }
    }

    export async function validatePythonForAutorestInstalled(context: IActionContext): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, undefined, 'python', '--version');
        } catch (error) {
            const message: string = localize('pythonForAutorestNotFound', 'Failed to find "python" | Extension needs AutoRest, Python to generate a Python function app from an OpenAPI specification.');
            if (!context.errorHandling.suppressDisplay) {
                window.showErrorMessage(message, DialogResponses.learnMore).then(async result => {
                    if (result === DialogResponses.learnMore) {
                        await openUrl('https://aka.ms/stencil/python');
                    }
                });
                context.errorHandling.suppressDisplay = true;
            }

            throw new Error(message);
        }
    }

    export async function addAutorestSpecificTypescriptDependencies(context: IFunctionWizardContext): Promise<void> {
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

    async function checkDependenciesDoNotExist(oldRequirements: string[], dependenciesToAddArray: string[]): Promise<string[]> {
        const finalDependencies: string[] = [];
        dependenciesToAddArray.forEach(dep => {
            const filteredArray: string[] = oldRequirements.filter(req => req.startsWith(dep));
            if (filteredArray.length === 0) {
                finalDependencies.push(dep);
            }
        });

        return finalDependencies;
    }

    async function prepareDependencies(dependencies: string[]): Promise<string> {
        return `${EOL}${dependencies.join(EOL)}${EOL}`;
    }

    export async function addAutorestSpecificPythonDependencies(context: IFunctionWizardContext): Promise<void> {
        let oldRequirements: string[];
        let newRequirements: string = '';
        const requirementsPath: string = path.join(context.projectPath, requirementsFileName);

        // Current list of dependencies to be added to support stencil generated projects.
        const dependenciesToAddArray: string[] = ['# DO NOT include azure-functions-worker in this file', '# The Python Worker is managed by Azure Functions platform', '# Manually managing azure-functions-worker may cause unexpected issues', 'azure-functions', 'msrest'];

        if (await fse.pathExists(requirementsPath)) {
            try {
                oldRequirements = (await fse.readFile(requirementsPath)).toString().split(EOL);
                const dependenciesRequired: string[] = await checkDependenciesDoNotExist(oldRequirements, dependenciesToAddArray);
                const newRequirementsArray: string[] = oldRequirements.concat(dependenciesRequired).filter(req => req !== '');  // Removing empty lines that get introduced due to the split and joins.

                newRequirements = await prepareDependencies(newRequirementsArray);
            } catch (error) {
                // If we failed to parse or edit the existing file, inform the user of the same.
                ext.outputChannel.appendLog(localize('cannotAddPythonDependencies', `Could not add ${dependenciesToAddArray.join()} to requirements.txt file. Please make sure you add the dependencies to the requirements.txt.`));
                return;
            }
        } else {
            newRequirements = await prepareDependencies(dependenciesToAddArray);
        }

        await fse.writeFile(requirementsPath, newRequirements);
    }
}
