/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GenericResource } from '@azure/arm-resources';
import { type IResourceGroupWizardContext } from '@microsoft/vscode-azext-azureutils';
import { type ExecuteActivityContext, type ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';

export interface IConnectorNamespaceWizardContext extends ISubscriptionActionContext, IResourceGroupWizardContext, ExecuteActivityContext {
    newConnectorNamespaceName?: string;
    connectorNamespaceNameResourceGroup?: string;
    connectorNamespace?: GenericResource;
}
