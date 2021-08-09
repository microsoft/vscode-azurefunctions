/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from "vscode-azureextensionui";
import { previewDescription } from "../../../constants";
import { hasMinFuncCliVersion } from "../../../funcCoreTools/hasMinFuncCliVersion";
import { localize } from "../../../localize";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";

export const java8: string = '8';
export const java11: string = '11';

export class JavaVersionStep extends AzureWizardPromptStep<IJavaProjectWizardContext> {
    public static async setDefaultVersion(context: IJavaProjectWizardContext): Promise<void> {
        if (!await hasMinFuncCliVersion(context, '3.0.2630', context.version)) {
            context.javaVersion = java8;
        }
    }

    public async prompt(context: IJavaProjectWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<string>[] = [
            { label: 'Java 8', data: java8 },
            { label: 'Java 11', description: previewDescription, data: java11 },
        ];
        const placeHolder: string = localize('selectJavaVersion', 'Select a version of Java');
        context.javaVersion = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.javaVersion;
    }
}
