/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { DialogResponses, nonNullValueAndProp, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import { ProgressLocation, window } from "vscode";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { FunctionTreeItemBase } from "../FunctionTreeItemBase";
import { type ContainerFunctionItem } from "./ContainerFunctionItem";
import { type ContainerFunctionsTreeItem } from "./ContainerFunctionsTreeItem";

export class ContainerFunctionTreeItem extends FunctionTreeItemBase {
    public readonly parent: ContainerFunctionsTreeItem;

    public constructor(parent: ContainerFunctionsTreeItem, func: ContainerFunctionItem) {
        super(parent, func);
        this.commandId = 'azureFunctions.viewProperties';
    }

    public static async create(context: IActionContext, parent: ContainerFunctionsTreeItem, func: ContainerFunctionItem): Promise<ContainerFunctionTreeItem> {
        const ti: ContainerFunctionTreeItem = new ContainerFunctionTreeItem(parent, func);
        await ti.initAsync(context);
        return ti;
    }

    public get viewProperties(): ViewPropertiesModel {
        return {
            data: this.rawConfig,
            label: this.function.name,
        }
    }

    public get contextValue(): string {
        return super.contextValue + 'container';
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', this.function.name);
        const deleting: string = localize('DeletingFunction', 'Deleting function "{0}"...', this.function.name);
        const deleteSucceeded: string = localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this.function.name);
        await context.ui.showWarningMessage(message, { modal: true, stepName: 'confirmDelete' }, DialogResponses.deleteResponse);
        await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
            ext.outputChannel.appendLog(deleting);
            const client = await createWebSiteClient([context, this.parent.subscription]);
            await client.webApps.deleteFunction(nonNullValueAndProp(this.parent.site, 'resourceGroup'), nonNullValueAndProp(this.parent.site, 'name'), this.function.name);
            void window.showInformationMessage(deleteSucceeded);
            ext.outputChannel.appendLog(deleteSucceeded);
        });
    }
}
