/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep } from "vscode-azureextensionui";
import { JavaBuildTool } from "../../../constants";
import { IProjectWizardContext } from "../../createNewProject/IProjectWizardContext";
import { IJavaProjectWizardContext } from "../../createNewProject/javaSteps/IJavaProjectWizardContext";
import { JavaBuildToolStep } from "../../createNewProject/javaSteps/JavaBuildToolStep";
import { isGradleProject, isMavenProject } from "../detectProjectLanguage";
import { JavaInitVSCodeStep } from "../InitVSCodeStep/JavaInitVSCodeStep";

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
