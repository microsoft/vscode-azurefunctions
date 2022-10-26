/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { hasMinFuncCliVersion } from "../../../funcCoreTools/hasMinFuncCliVersion";
import { localize, previewDescription } from "../../../localize";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";
import { getJavaVersion } from "./JavaVersions";

export const java8: string = '8';
export const java11: string = '11';
export const java17: string = '17';

type javaVersionInfo = {
    label: string,
    data: string,
    description?: string,
    miniFunc: string
}

const versionInfo: javaVersionInfo[] = [
    { label: 'Java 8', data: java8, miniFunc: '1.0.0' },
    { label: 'Java 11', data: java11, miniFunc: '3.0.2630' },
    { label: 'Java 17', data: java17, miniFunc: '4.0.0', description: previewDescription }
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

    async getPicks(context: IJavaProjectWizardContext): Promise<IAzureQuickPickItem<string>[]> {
        const javaVersion: number = await getJavaVersion();
        const result: IAzureQuickPickItem<string>[] = [];
        for (const version of versionInfo) {
            if (await hasMinFuncCliVersion(context, version.miniFunc, context.version) && javaVersion >= Number(version.data)) {
                result.push(version);
            }
        }
        return result;
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.javaVersion;
    }
}
