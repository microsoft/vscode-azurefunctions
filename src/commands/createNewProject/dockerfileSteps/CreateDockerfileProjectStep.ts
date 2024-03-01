/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../extensionVariables";
import { cpUtils } from "../../../utils/cpUtils";
import { type IFunctionWizardContext } from "../../createFunction/IFunctionWizardContext";

export class CreateDockerfileProjectStep extends AzureWizardExecuteStep<IFunctionWizardContext>{
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
