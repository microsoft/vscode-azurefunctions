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
        let language = nonNullValueAndProp(context, 'language').toLowerCase();
        if (language === 'c#') {
            language = 'csharp';
        }

        await cpUtils.executeCommand(ext.outputChannel, nonNullValueAndProp(context, 'projectPath'), "func", "init", "--worker-runtime", language, "--docker");
    }

    public shouldExecute(): boolean {
        return true;
    }
}
