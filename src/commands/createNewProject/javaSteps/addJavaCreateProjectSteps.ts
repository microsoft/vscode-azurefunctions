/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem } from "vscode-azureextensionui";
import { JavaBuildTool, previewDescription } from "../../../constants";
import { localize } from "../../../localize";
import { IProjectWizardContext } from "../IProjectWizardContext";
import { GradleProjectCreateStep } from "../ProjectCreateStep/GradleProjectCreateSteps";
import { MavenProjectCreateStep } from "../ProjectCreateStep/MavenProjectCreateSteps";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";
import { JavaAppNameStep } from "./JavaAppNameStep";
import { JavaArtifactIdStep } from "./JavaArtifactIdStep";
import { JavaGroupIdStep } from "./JavaGroupIdStep";
import { JavaPackageNameStep } from "./JavaPackageNameStep";
import { JavaProjectVersionStep } from "./JavaProjectVersionStep";
import { JavaVersionStep } from "./JavaVersionStep";

export async function addJavaCreateProjectSteps(
    context: IJavaProjectWizardContext,
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
    await JavaVersionStep.setDefaultVersion(context);
    promptSteps.push(new JavaVersionStep(), new JavaGroupIdStep(), new JavaArtifactIdStep(), new JavaProjectVersionStep(), new JavaPackageNameStep(), new JavaAppNameStep());

    const picks: IAzureQuickPickItem<JavaBuildTool>[] = [
        { label: 'Maven', data: JavaBuildTool.maven },
        { label: 'Gradle', description: previewDescription, data: JavaBuildTool.gradle },
    ];
    const placeHolder: string = localize('selectJavaBuildTool', 'Select the build tool for Java project');
    context.buildTool = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    if (context.buildTool === JavaBuildTool.maven) {
        executeSteps.push(await MavenProjectCreateStep.createStep(context));
    } else if (context.buildTool === JavaBuildTool.gradle) {
        executeSteps.push(await GradleProjectCreateStep.createStep(context));
    } else {
        throw new Error(localize('invalidJavaBuildTool', 'Internal error: Invalid java build tool "{0}".', context.buildTool));
    }
}
