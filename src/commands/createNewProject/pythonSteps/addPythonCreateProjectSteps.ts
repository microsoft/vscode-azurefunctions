/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep } from "vscode-azureextensionui";
import { getWorkspaceSetting } from "../../../vsCodeConfig/settings";
import { IProjectWizardContext } from '../IProjectWizardContext';
import { PythonProjectCreateStep } from "../ProjectCreateStep/PythonProjectCreateStep";
import { IPythonVenvWizardContext } from "./IPythonVenvWizardContext";
import { PythonAliasListStep } from "./PythonAliasListStep";
import { PythonVenvCreateStep } from "./PythonVenvCreateStep";

export function addPythonCreateProjectSteps(
    context: IProjectWizardContext & IPythonVenvWizardContext,
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): void {

    const createPythonVenv: boolean = !!getWorkspaceSetting<boolean>('createPythonVenv', context.workspacePath);
    context.telemetry.properties.createPythonVenv = String(createPythonVenv);

    if (createPythonVenv) {
        promptSteps.push(new PythonAliasListStep());
        executeSteps.push(new PythonVenvCreateStep());
    }

    executeSteps.push(new PythonProjectCreateStep());
}
