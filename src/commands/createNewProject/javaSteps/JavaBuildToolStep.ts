/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { JavaBuildTool } from "../../../constants";
import { localize, previewDescription } from "../../../localize";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";


export class JavaBuildToolStep extends AzureWizardPromptStep<IJavaProjectWizardContext> {
    public static async setDefaultBuildTool(context: IJavaProjectWizardContext): Promise<void> {
        context.buildTool = JavaBuildTool.maven;
    }

    public async prompt(context: IJavaProjectWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<JavaBuildTool>[] = [
            { label: 'Maven', data: JavaBuildTool.maven },
            { label: 'Gradle', description: previewDescription, data: JavaBuildTool.gradle },
        ];
        const placeHolder: string = localize('selectJavaBuildTool', 'Select the build tool for Java project');
        context.buildTool = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.buildTool;
    }
}
