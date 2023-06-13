/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthorizationRule, EHNamespace } from '@azure/arm-eventhub';
import { IResourceGroupWizardContext } from '@microsoft/vscode-azext-azureutils';
import { ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';

export interface IEventHubWizardContext extends ISubscriptionActionContext, IResourceGroupWizardContext {
    /**
     * NOTE: The name of this variable should not change. It matches the name of the binding setting written to function.json
     */
    eventhubname?: string;
    newEventHubsNamespaceName?: string;
    eventHubsNamespace?: EHNamespace;
    newEventHubName?: string;
    newAuthRuleName?: string;
    authRule?: AuthorizationRule;
    isNamespaceAuthRule?: boolean;
}
