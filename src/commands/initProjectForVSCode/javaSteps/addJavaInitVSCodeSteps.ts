/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep, type AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { JavaBuildTool } from "../../../constants";
import { type IProjectWizardContext } from "../../createNewProject/IProjectWizardContext";
import { type IJavaProjectWizardContext } from "../../createNewProject/javaSteps/IJavaProjectWizardContext";
import { JavaBuildToolStep } from "../../createNewProject/javaSteps/JavaBuildToolStep";
import { JavaInitVSCodeStep } from "../InitVSCodeStep/JavaInitVSCodeStep";
import { isGradleProject, isMavenProject } from "../detectProjectLanguage";

export async function addJavaInitVSCodeSteps(
    context: IJavaProjectWizardContext,
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
    if (!context.buildTool) {
        const isMaven: boolean = await isMavenProject(context.projectPath);
        const isGradle: boolean = await isGradleProject(context.projectPath);
        if (isMaven === isGradle) {
            promptSteps.push(new JavaBuildToolStep());
        } else if (isMaven) {
            context.buildTool = JavaBuildTool.maven;
        } else if (isGradle) {
            context.buildTool = JavaBuildTool.gradle;
        }
    }
    executeSteps.push(new JavaInitVSCodeStep());
}
