/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "vscode-azureextensionui";
import { localize } from "../../../localize";
import { IProjectWizardContext } from "../../createNewProject/IProjectWizardContext";
import { isGradleProject, isMavenProject } from "../detectProjectLanguage";
import { GradleInitVSCodeStep } from "../InitVSCodeStep/GradleInitVSCodeStep";
import { MavenInitVSCodeStep } from "../InitVSCodeStep/MavenInitVSCodeStep";

export async function addJavaInitVSCodeSteps(
    context: IProjectWizardContext,
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
    if (await isMavenProject(context.projectPath)) {
        executeSteps.push(new MavenInitVSCodeStep());
    } else if (await isGradleProject(context.projectPath)) {
        executeSteps.push(new GradleInitVSCodeStep());
    } else {
        throw new Error(localize('pomNotFound', 'Cannot find `pom.xml` or `build.gradle` in current project, please make sure the language setting is correct.'));
    }
}
