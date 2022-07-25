/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ActivityTreeItemOptionsBase, AzExtParentTreeItem, ExecuteActivityContext, GenericTreeItem, nonNullProp } from "@microsoft/vscode-azext-utils";
import { ActivityTreeItemOptions, AppResource } from "@microsoft/vscode-azext-utils/hostapi";
import { ThemeIcon } from "vscode";
import { localize } from "./localize";

// Class takes care of customizing how an activity is displayed as a tree item
export class CreateFunctionAppActivityOptions extends ActivityTreeItemOptionsBase<ExecuteActivityContext> {

    constructor(protected readonly context: ExecuteActivityContext) {
        super(context);
    }

    // make it so I don't have to copy the Click to view resource code?
    protected override successState(): ActivityTreeItemOptions {
        const activityResult = this.context.activityResult;
        return {
            label: this.label,
            getChildren: activityResult ? ((parent: AzExtParentTreeItem) => {
                const appResource: AppResource = {
                    id: nonNullProp(activityResult, 'id'),
                    name: nonNullProp(activityResult, 'name'),
                    type: nonNullProp(activityResult, 'type'),
                }

                const ti = new GenericTreeItem(parent, {
                    contextValue: 'executeResult',
                    label: localize("clickToView", "Click to view resource"),
                    commandId: 'azureResourceGroups.revealResource',
                });

                ti.commandArgs = [appResource];

                const viewDocs = new GenericTreeItem(parent, {
                    contextValue: 'viewFunctionsDocs',
                    label: 'View Azure Functions Documentation',
                    iconPath: new ThemeIcon('book')
                });

                return [ti, viewDocs];

            }) : undefined
        }
    }
}
