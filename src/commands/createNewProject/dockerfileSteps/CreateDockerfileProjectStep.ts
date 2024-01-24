/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ext } from "@microsoft/vscode-azext-serviceconnector";
import { AzureWizardExecuteStep, UserCancelledError, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { validateFuncCoreToolsInstalled } from "../../../funcCoreTools/validateFuncCoreToolsInstalled";
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";
import { type IFunctionWizardContext } from "../../createFunction/IFunctionWizardContext";

export class CreateDockerfileProjectStep extends AzureWizardExecuteStep<IFunctionWizardContext>{
    public priority: number = 100;

    public async execute(context: IFunctionWizardContext): Promise<void> {
        const message: string = localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to run this command.');
        if (!await validateFuncCoreToolsInstalled(context, message, context.workspacePath)) {
            throw new UserCancelledError('validateFuncCoreToolsInstalled');
        }

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
