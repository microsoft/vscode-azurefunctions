/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type WebviewBundleLocation } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import { type ExtensionContext } from 'vscode';

export function getConnectorTriggerPickerBundleLocation(
    context: ExtensionContext,
): WebviewBundleLocation {
    return {
        distDir: path.join(context.extensionPath, 'dist', 'webview'),
        scriptFileName: 'connectorTriggerPicker.js',
        styleFileName: 'connectorTriggerPicker.css',
    };
}
