/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenDialogOptions, ProgressLocation, Uri, window, workspace } from "vscode";
import { AzureWizardExecuteStep } from "vscode-azureextensionui";
import { ProjectLanguage } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { IFunctionWizardContext } from "../../createFunction/IFunctionWizardContext";

export class OpenAPICreateStep extends AzureWizardExecuteStep<IFunctionWizardContext> {
    public priority: number = 220;

    public async execute(wizardContext: IFunctionWizardContext): Promise<void> {
        const uris: Uri[] = await this.askDocument();
        const uri: Uri = uris[0];
        const args: string[] = [];

        const error_message = "Please make sure you have Autorest installed. Visit https://aka.ms/autorest to find more information on Autorest and installation steps.";

        if (!isNPMInstalled()) {
            throw new Error(localize("notSupported", `NPM is not installed. ${error_message}`));
        } else if (!isAutoRestInstalled()) {
            throw new Error(localize("notSupported", `Autorest could not be detected on the system. ${error_message}`));
        }

        args.push(`--input-file:${cpUtils.wrapArgInQuotes(uri.fsPath)} --version:3.0.6314`);

        if (wizardContext.language === ProjectLanguage.TypeScript) {
            args.push('--azure-functions-typescript');
            args.push('--no-namespace-folders:True');
        } else if (wizardContext.language === ProjectLanguage.CSharp) {
            args.push('--namespace:Microsoft.Azure.Stencil');
            args.push('--azure-functions-csharp');
        } else if (wizardContext.language === ProjectLanguage.Java) {
            args.push('--namespace:com.microsoft.azure.stencil');
            args.push('--azure-functions-java');
        } else if (wizardContext.language === ProjectLanguage.Python) {
            args.push('--azure-functions-python');
            args.push('--no-namespace-folders:True');
            args.push('--no-async');
        } else {
            throw new Error(localize("notSupported", "Not a supported language. We currently support C#, Java, Python, and Typescript"));
        }

        args.push('--generate-metadata:false');
        args.push(`--output-folder:${wizardContext.projectPath}`);

        ext.outputChannel.show();
        await window.withProgress({ location: ProgressLocation.Notification, title: localize('generatingFunctions', 'Generating Http trigger functions from OpenAPI...') }, async () => {
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'autorest', ...args);
        });
    }
    public shouldExecute(): boolean {
        return true;
    }

    public async askDocument(): Promise<Uri[]> {
        const openDialogOptions: OpenDialogOptions = {
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            title: 'Select OpenAPI (v2 or V3) Specification File',
            openLabel: 'Specification File',
            filters: {
                JSON: ['json', 'yaml']
            }
        };

        if (workspace.workspaceFolders) {
            openDialogOptions.defaultUri = Uri.file(workspace.workspaceFolders[0].uri.toString());
        }
        return await ext.ui.showOpenDialog(openDialogOptions);
    }
}

async function isAutoRestInstalled(): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'autorest', '--help');
        return true;
    } catch (error) {
        return false;
    }
}

async function isNPMInstalled(): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'npm', '--version');
        return true;
    } catch (error) {
        return false;
    }
}
