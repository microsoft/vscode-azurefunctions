/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, IAzureQuickPickItem } from "vscode-azureextensionui";
import { JavaBuildTool, previewDescription } from "../../../constants";
import { localize } from "../../../localize";
import { IProjectWizardContext } from "../../createNewProject/IProjectWizardContext";
import { IJavaProjectWizardContext } from "../../createNewProject/javaSteps/IJavaProjectWizardContext";
import { isGradleProject, isMavenProject } from "../detectProjectLanguage";
import { GradleInitVSCodeStep } from "../InitVSCodeStep/GradleInitVSCodeStep";
import { MavenInitVSCodeStep } from "../InitVSCodeStep/MavenInitVSCodeStep";

export async function addJavaInitVSCodeSteps(
    context: IJavaProjectWizardContext,
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
    if (!context.buildTool) {
        context.buildTool = await getJavaBuildTool(context);
    }
    if (context.buildTool === JavaBuildTool.maven) {
        executeSteps.push(new MavenInitVSCodeStep());
    } else if (context.buildTool === JavaBuildTool.gradle) {
        executeSteps.push(new GradleInitVSCodeStep());
    }
}

async function getJavaBuildTool(context: IJavaProjectWizardContext): Promise<JavaBuildTool> {
    const isMaven: boolean = await isMavenProject(context.projectPath);
    const isGradle: boolean = await isGradleProject(context.projectPath);
    if (isMaven && isGradle) {
        const picks: IAzureQuickPickItem<JavaBuildTool>[] = [
            { label: 'Maven', data: JavaBuildTool.maven },
            { label: 'Gradle', description: previewDescription, data: JavaBuildTool.gradle },
        ];
        const placeHolder: string = localize('selectJavaBuildTool', 'Select the build tool for Java project');
        return (await context.ui.showQuickPick(picks, { placeHolder })).data;
    } else if (isMaven) {
        return JavaBuildTool.maven;
    } else if (isGradle) {
        return JavaBuildTool.gradle;
    } else {
        throw new Error(localize('pomNotFound', 'Cannot find `pom.xml` or `build.gradle` in current project, please make sure the language setting is correct.'));
    }
}
