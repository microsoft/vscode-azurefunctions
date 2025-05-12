/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { type IFunctionWizardContext } from "../../createFunction/IFunctionWizardContext";

export class CreateDockerfileProjectStep extends AzureWizardExecuteStepWithActivityOutput<IFunctionWizardContext> {
    stepName: string = "CreateDockerfileProjectStep";
    protected getTreeItemLabel(context: IFunctionWizardContext): string {
        return localize('createDockerfileProject', 'Create Dockerfile project in "{0}"', nonNullValueAndProp(context, 'projectPath'));
    }
    protected getOutputLogSuccess(context: IFunctionWizardContext): string {
        return localize('createDockerfileProjectSuccess', 'Successfully created Dockerfile project in "{0}"', nonNullValueAndProp(context, 'projectPath'));
    }
    protected getOutputLogFail(context: IFunctionWizardContext): string {
        return localize('createDockerfileProjectFail', 'Failed to create Dockerfile project in "{0}"', nonNullValueAndProp(context, 'projectPath'));
    }
    protected getOutputLogProgress(context: IFunctionWizardContext): string {
        return localize('creatingDockerfileProject', 'Creating Dockerfile project in "{0}..."', nonNullValueAndProp(context, 'projectPath'));
    }
    public priority: number = 100;

    public async execute(context: IFunctionWizardContext): Promise<void> {
        const language = nonNullValueAndProp(context, 'language').toLowerCase();
        // If the language is C# this command needs to be called earlier as the versioning in the .csproj file is different from the one in the template
        if (language !== 'c#') {
            await cpUtils.executeCommand(ext.outputChannel, nonNullValueAndProp(context, 'projectPath'), "func", "init", "--worker-runtime", language, "--docker");
        }
    }

    public shouldExecute(): boolean {
        return true;
    }
}
