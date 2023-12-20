/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { createActivityContext } from "../../../utils/activityUtils";
import { FolderListStep } from "../FolderListStep";
import { type IProjectWizardContext } from "../IProjectWizardContext";
import { OpenBehaviorStep } from "../OpenBehaviorStep";
import { OpenFolderStep } from "../OpenFolderStep";
import { CreateDockerfileProjectStep } from "./CreateDockerfileProjectStep";
import { DockerfileProjectLanguageStep } from "./DockefileProjectLanguageStep";
import { type IDockerfileProjectContext } from "./IDockerfileProjectContext";

export async function createNewProjectWithDockerfile(context: IActionContext): Promise<void> {
    const wizardContext: Partial<IDockerfileProjectContext> & Partial<IProjectWizardContext> & IActionContext = {
        ...context,
        ...(await createActivityContext())
    }

    const wizard: AzureWizard<IDockerfileProjectContext> = new AzureWizard(wizardContext, {
        title: localize('createNewProject', 'Create new project with dockerfile'),
        promptSteps: [new FolderListStep(), new DockerfileProjectLanguageStep(), new OpenBehaviorStep()],
        executeSteps: [new CreateDockerfileProjectStep(), new OpenFolderStep()]
    });

    wizardContext.activityTitle = localize('createNewDockerfileProject', 'Create new project with dockerfile');

    await wizard.prompt();
    await wizard.execute();
}
