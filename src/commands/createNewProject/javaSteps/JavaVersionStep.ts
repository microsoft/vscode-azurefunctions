/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { previewDescription } from "../../../constants";
import { hasMinFuncCliVersion } from "../../../funcCoreTools/hasMinFuncCliVersion";
import { localize } from "../../../localize";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";

export const java8: string = '8';
export const java11: string = '11';
export const java17: string = '17';

const versionInfo: [string, string, string, string?][] = [
    [java8, 'Java 8', '1.0.0'],
    [java11, 'Java 11', '3.0.2630'],
    [java17, 'Java 17', '4.0.0', previewDescription]
];

export class JavaVersionStep extends AzureWizardPromptStep<IJavaProjectWizardContext> {

    public static async setDefaultVersion(context: IJavaProjectWizardContext): Promise<void> {
        if (!await hasMinFuncCliVersion(context, '3.0.2630', context.version)) {
            context.javaVersion = java8;
        }
    }

    public async prompt(context: IJavaProjectWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<string>[] = await this.getPicks(context);
        const placeHolder: string = localize('selectJavaVersion', 'Select a version of Java');
        context.javaVersion = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    // todo: get runtime from Get Function App Stacks API and validate local java version
    async getPicks(context: IJavaProjectWizardContext): Promise<IAzureQuickPickItem<string>[]> {
        const result: IAzureQuickPickItem<string>[] = [];
        for (const [javaVersion, displayName, miniFunc, description] of versionInfo) {
            if (await hasMinFuncCliVersion(context, miniFunc, context.version)) {
                result.push({ label: displayName, data: javaVersion, description: description });
            }
        }
        return result;
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.javaVersion;
    }
}
