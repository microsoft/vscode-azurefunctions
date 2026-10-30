/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '@microsoft/vscode-azext-webview/webview/global-styles';

import { createWebviewRender } from '@microsoft/vscode-azext-webview/webview';
import './styles/connectorTriggerPicker.scss';
import { WebviewRegistry } from './WebviewRegistry';

export type ConnectorTriggerViewKey = keyof typeof WebviewRegistry;

export const render = createWebviewRender(WebviewRegistry);
