/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizardExecuteStep, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { window } from "vscode";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { type DeleteFunctionappWizardContext } from "./DeleteFunctionAppWizardContext";

export class DeleteContainerizedFunctionappStep extends AzureWizardExecuteStep<DeleteFunctionappWizardContext> {
    public priority: number = 100;

    public async execute(context: DeleteFunctionappWizardContext): Promise<void> {
        const deleting: string = localize('DeletingFunctionApp', 'Deleting function app "{0}"...', context.site.name);
        const deleteSucceeded: string = localize('DeleteFunctionAppSucceeded', 'Successfully deleted function app "{0}".', context.site.name);

        ext.outputChannel.appendLog(deleting);
        const client = await createWebSiteClient([context, context.subscription]);
        await client.webApps.delete(nonNullValueAndProp(context.site, 'resourceGroup'), nonNullValueAndProp(context.site, 'name'));
        void window.showInformationMessage(deleteSucceeded);
        ext.outputChannel.appendLog(deleteSucceeded);
    }

    public shouldExecute(): boolean {
        return true;
    }
}
