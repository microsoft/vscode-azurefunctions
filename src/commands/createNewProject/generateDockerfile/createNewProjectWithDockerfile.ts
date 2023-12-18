/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { createActivityContext } from "../../../utils/activityUtils";
import { FolderListStep } from "../FolderListStep";
import { IProjectWizardContext } from "../IProjectWizardContext";
import { OpenBehaviorStep } from "../OpenBehaviorStep";
import { OpenFolderStep } from "../OpenFolderStep";
import { CreateDockerfileProjectStep } from "./CreateDockerfileProjectStep";
import { DockerfileProjectLanguageStep } from "./DockefileProjectLanguageStep";
import { IDockerfileProjectContext } from "./IDockerfileProjectContext";

export async function createNewProjectWithDockerfile(context: IActionContext): Promise<void> {
    const wizardContext: Partial<IDockerfileProjectContext> & Partial<IProjectWizardContext> & IActionContext = {
        ...context,
        ...(await createActivityContext())
    }

    //if statements from createNewProject??
    //Is there a way to show new project created in the explorer?

    const wizard: AzureWizard<IDockerfileProjectContext> = new AzureWizard(wizardContext, {
        title: localize('createNewProject', 'Create new project with dockerfile'),
        promptSteps: [new FolderListStep(), new DockerfileProjectLanguageStep(), new OpenBehaviorStep()], //test each language type
        executeSteps: [new CreateDockerfileProjectStep(), new OpenFolderStep()]
    });

    wizardContext.activityTitle = localize('createNewDockerfileProject', 'Create new project with dockerfile');
    //put children for the activity title since running npm install takes a while
    await wizard.prompt();
    await wizard.execute();
}
