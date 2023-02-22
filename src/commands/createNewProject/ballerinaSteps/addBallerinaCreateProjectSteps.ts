/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { IProjectWizardContext } from "../IProjectWizardContext";
import { BallerinaProjectCreateStep } from "../ProjectCreateStep/BallerinaProjectCreateSteps";
import { BallerinaBackendStep } from "./BallerinaBackendStep";
import { BalPackageNameStep } from "./BallerinaPackageNameStep";
import { BalPackageOrgStep } from "./BallerinaPackageOrgStep";
import { BalPackageVersionStep } from "./BallerinaPackageVersionStep";

export async function addBallerinaCreateProjectSteps(
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
    promptSteps.push(new BalPackageNameStep(), new BalPackageOrgStep(), new BalPackageVersionStep(), new BallerinaBackendStep());
    executeSteps.push(new BallerinaProjectCreateStep());
}
