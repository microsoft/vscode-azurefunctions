/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope, HostKeys } from "@azure/arm-appservice";
import { IFunctionKeys, ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { IActionContext, nonNullProp, parseError } from "@microsoft/vscode-azext-utils";
import { HttpAuthLevel, ParsedFunctionJson } from "../../funcConfig/function";
import { FunctionBase } from "../FunctionTreeItemBase";
import { IProjectTreeItem } from "../IProjectTreeItem";

export class RemoteFunction extends FunctionBase {
    constructor(
        public readonly project: IProjectTreeItem,
        public readonly name: string,
        public readonly config: ParsedFunctionJson,
        private readonly site: ParsedSite,
        public readonly data?: FunctionEnvelope,
    ) {
        super(project, name, config, data);
    }

    public async getKey(context: IActionContext): Promise<string | undefined> {
        if (this.isAnonymous) {
            return undefined;
        }

        const client = await this.site.createClient(context);
        if (this.config.authLevel === HttpAuthLevel.function) {
            try {
                const functionKeys: IFunctionKeys = await client.listFunctionKeys(this.name);
                return nonNullProp(functionKeys, 'default');
            } catch (error) {
                if (parseError(error).errorType === 'NotFound') {
                    // There are no function-specific keys, fall through to admin key
                } else {
                    throw error;
                }
            }
        }

        const hostKeys: HostKeys = await client.listHostKeys();
        return nonNullProp(hostKeys, 'masterKey');
    }
}
