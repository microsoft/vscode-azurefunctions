/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SBNamespace } from '@azure/arm-servicebus';
import { ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';

export interface IServiceBusWizardContext extends ISubscriptionActionContext {
    sbNamespace?: SBNamespace;
}
