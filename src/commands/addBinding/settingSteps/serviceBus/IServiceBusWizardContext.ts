/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceBusManagementModels } from '@azure/arm-servicebus';
import { ISubscriptionActionContext } from 'vscode-azureextensionui';

export interface IServiceBusWizardContext extends ISubscriptionActionContext {
    sbNamespace?: ServiceBusManagementModels.SBNamespace;
}
