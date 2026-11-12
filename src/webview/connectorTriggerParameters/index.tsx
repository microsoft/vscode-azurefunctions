/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '@microsoft/vscode-azext-webview/webview/global-styles';
import { createWebviewRender } from '@microsoft/vscode-azext-webview/webview';
import { ConnectorTriggerSetupView } from './ConnectorTriggerSetupView';
import './connectorTriggerParameters.scss';

export const render = createWebviewRender({ connectorTriggerSetup: ConnectorTriggerSetupView });
