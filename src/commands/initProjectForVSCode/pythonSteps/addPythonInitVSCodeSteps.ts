/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { AzureWizardExecuteStep, AzureWizardPromptStep } from "vscode-azureextensionui";
import { venvUtils } from '../../../utils/venvUtils';
import { IProjectWizardContext } from "../../createNewProject/IProjectWizardContext";
import { IPythonVenvWizardContext } from "../../createNewProject/pythonSteps/IPythonVenvWizardContext";
import { PythonInitVSCodeStep } from "../InitVSCodeStep/PythonInitVSCodeStep";
import { PythonVenvListStep } from "./PythonVenvListStep";

export async function addPythonInitVSCodeSteps(
    context: IProjectWizardContext & IPythonVenvWizardContext,
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {

    const venvs: string[] = [];

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
    }

    executeSteps.push(new PythonInitVSCodeStep());
}
