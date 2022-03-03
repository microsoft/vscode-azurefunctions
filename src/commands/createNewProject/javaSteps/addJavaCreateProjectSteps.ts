/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { IProjectWizardContext } from "../IProjectWizardContext";
import { GradleProjectCreateStep } from "../ProjectCreateStep/GradleProjectCreateSteps";
import { MavenProjectCreateStep } from "../ProjectCreateStep/MavenProjectCreateSteps";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";
import { JavaAppNameStep } from "./JavaAppNameStep";
import { JavaArtifactIdStep } from "./JavaArtifactIdStep";
import { JavaBuildToolStep } from "./JavaBuildToolStep";
import { JavaGroupIdStep } from "./JavaGroupIdStep";
import { JavaPackageNameStep } from "./JavaPackageNameStep";
import { JavaProjectVersionStep } from "./JavaProjectVersionStep";
import { JavaVersionStep } from "./JavaVersionStep";

export async function addJavaCreateProjectSteps(
    context: IJavaProjectWizardContext,
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
    await JavaVersionStep.setDefaultVersion(context);
    promptSteps.push(new JavaVersionStep(), new JavaGroupIdStep(), new JavaArtifactIdStep(), new JavaProjectVersionStep(), new JavaPackageNameStep(), new JavaAppNameStep(), new JavaBuildToolStep());
    executeSteps.push(new MavenProjectCreateStep(), new GradleProjectCreateStep());
}
