/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep, type AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { ballerinaUtils } from "../../../utils/ballerinaUtils";
import { type IProjectWizardContext } from "../IProjectWizardContext";
import { BallerinaProjectCreateStep } from "../ProjectCreateStep/BallerinaProjectCreateStep";
import { BallerinaBackendStep } from "./BallerinaBackendStep";
import { type IBallerinaProjectWizardContext } from "./IBallerinaProjectWizardContext";

export async function addBallerinaCreateProjectSteps(
    context: IBallerinaProjectWizardContext,
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
    await ballerinaUtils.getBallerinaVersion(context);
    promptSteps.push(new BallerinaBackendStep());
    executeSteps.push(new BallerinaProjectCreateStep());
}
