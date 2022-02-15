/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import * as fse from 'fs-extra';
import { venvUtils } from '../../../utils/venvUtils';
import { getWorkspaceSetting } from "../../../vsCodeConfig/settings";
import { IProjectWizardContext } from "../../createNewProject/IProjectWizardContext";
import { IPythonVenvWizardContext } from "../../createNewProject/pythonSteps/IPythonVenvWizardContext";
import { PythonAliasListStep } from "../../createNewProject/pythonSteps/PythonAliasListStep";
import { PythonVenvCreateStep } from "../../createNewProject/pythonSteps/PythonVenvCreateStep";
import { PythonInitVSCodeStep } from "../InitVSCodeStep/PythonInitVSCodeStep";
import { PythonVenvListStep } from "./PythonVenvListStep";

export async function addPythonInitVSCodeSteps(
    context: IProjectWizardContext & IPythonVenvWizardContext,
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {

    const createPythonVenv: boolean = !!getWorkspaceSetting<boolean>('createPythonVenv', context.workspacePath);
    const venvs: string[] = [];

    context.telemetry.properties.createPythonVenv = String(createPythonVenv);

    if (await fse.pathExists(context.projectPath)) {
        const fsPaths: string[] = await fse.readdir(context.projectPath);
        await Promise.all(fsPaths.map(async venvName => {
            if (await venvUtils.venvExists(venvName, context.projectPath)) {
                venvs.push(venvName);
            }
        }));
    }

    if (venvs.length > 0) {
        context.useExistingVenv = true;
        if (venvs.length === 1) {
            context.venvName = venvs[0];
        } else {
            promptSteps.push(new PythonVenvListStep(venvs));
        }
    } else if (createPythonVenv) {
        promptSteps.push(new PythonAliasListStep());
        executeSteps.push(new PythonVenvCreateStep());
    }

    executeSteps.push(new PythonInitVSCodeStep());
}
