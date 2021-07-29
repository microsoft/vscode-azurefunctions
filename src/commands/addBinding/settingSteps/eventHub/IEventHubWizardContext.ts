/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISubscriptionActionContext } from 'vscode-azureextensionui';

export interface IEventHubWizardContext extends ISubscriptionActionContext {
    namespaceName?: string;
    resourceGroupName?: string;

    /**
     * NOTE: The name of this variable should not change. It matches the name of the binding setting written to function.json
     */
    eventhubname?: string;

    authRuleName?: string;
    isNamespaceAuthRule?: boolean;
}
