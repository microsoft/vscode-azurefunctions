/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type HostKeys, type Site } from "@azure/arm-appservice";
import { createWebSiteClient, type IFunctionKeys } from "@microsoft/vscode-azext-azureappservice";
import { nonNullProp, nonNullValueAndProp, parseError, type IActionContext } from "@microsoft/vscode-azext-utils";
import { HttpAuthLevel, type ParsedFunctionJson } from "../../funcConfig/function";
import { FunctionBase } from "../FunctionBase";
import { type IProjectTreeItem } from "../IProjectTreeItem";
import { type ContainerFunctionsTreeItem } from "./ContainerFunctionsTreeItem";

export class ContainerFunctionItem extends FunctionBase {
    constructor(
        public readonly project: IProjectTreeItem,
        public readonly name: string,
        public readonly config: ParsedFunctionJson,
        public readonly parent: ContainerFunctionsTreeItem,
        private readonly site: Site,
    ) {
        super(project, name, config);
    }

    public async getKey(context: IActionContext): Promise<string | undefined> {
        if (this.isAnonymous) {
            return undefined;
        }

        const client = await createWebSiteClient([context, this.parent.subscription]);
        if (this.config.authLevel === HttpAuthLevel.function) {
            try {
                const functionKeys: IFunctionKeys = await client.webApps.listFunctionKeys(nonNullValueAndProp(this.site, 'resourceGroup'), nonNullValueAndProp(this.site, 'name'), this.name);
                return nonNullProp(functionKeys, 'default');
            } catch (error) {
                if (parseError(error).errorType === 'NotFound') {
                    // There are no function-specific keys, fall through to admin key
                } else {
                    throw error;
                }
            }
        }
        const hostKeys: HostKeys = await client.webApps.listHostKeys(nonNullValueAndProp(this.site, 'resourceGroup'), nonNullValueAndProp(this.site, 'name'));
        return nonNullProp(hostKeys, 'masterKey');
    }
}
