/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { IActionContext } from 'vscode-azureextensionui';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { requestUtils } from '../../utils/requestUtils';
import { FunctionTreeItemBase } from '../FunctionTreeItemBase';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';

export class LocalFunctionTreeItem extends FunctionTreeItemBase {
    public readonly parent: LocalFunctionsTreeItem;
    public readonly functionJsonPath: string | undefined;

    private constructor(parent: LocalFunctionsTreeItem, name: string, config: ParsedFunctionJson, functionJsonPath: string | undefined, func: WebSiteManagementModels.FunctionEnvelope | undefined) {
        super(parent, config, name, func);
        this.functionJsonPath = functionJsonPath;
    }

    public static async create(parent: LocalFunctionsTreeItem, name: string, config: ParsedFunctionJson, functionJsonPath: string | undefined, func: WebSiteManagementModels.FunctionEnvelope | undefined, context: IActionContext): Promise<LocalFunctionTreeItem> {
        const ti: LocalFunctionTreeItem = new LocalFunctionTreeItem(parent, name, config, functionJsonPath, func);
        // initialize
        await ti.refreshImpl(context, true);
        return ti;
    }

    public async refreshFuncEnvelope(): Promise<WebSiteManagementModels.FunctionEnvelope | undefined> {
        try {
            const response = await requestUtils.sendRequestWithExtTimeout({
                url: `${this.parent.parent.hostUrl}/admin/functions/${this.name}`,
                method: 'GET'
            });
            return requestUtils.convertToAzureSdkObject(response.parsedBody);
        } catch {
            // project isn't running
            return undefined;
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async getKey(): Promise<string | undefined> {
        return undefined;
    }
}
