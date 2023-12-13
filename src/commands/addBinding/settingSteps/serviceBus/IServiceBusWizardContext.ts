/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SBNamespace } from '@azure/arm-servicebus';
import { type ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';

export interface IServiceBusWizardContext extends ISubscriptionActionContext {
    sbNamespace?: SBNamespace;
}
