/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deleteSite } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizardExecuteStep, nonNullProp } from "@microsoft/vscode-azext-utils";
import { IDeleteWizardContext } from "./IDeleteWizardContext";

export class FunctionAppDeleteStep extends AzureWizardExecuteStep<IDeleteWizardContext> {
    public priority: number = 100;

    public async execute(context: IDeleteWizardContext): Promise<void> {
        const node = nonNullProp(context, 'node');
        await deleteSite(context, node.site);
    }

    public shouldExecute(_wizardContext: IDeleteWizardContext): boolean {
        return true;
    }
}
