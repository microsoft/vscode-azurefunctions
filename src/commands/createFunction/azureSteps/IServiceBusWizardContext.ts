/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceBusManagementModels } from 'azure-arm-sb';
import { ISubscriptionWizardContext } from 'vscode-azureextensionui';

export interface IServiceBusWizardContext extends ISubscriptionWizardContext {
    sbNamespace?: ServiceBusManagementModels.SBNamespace;
}
