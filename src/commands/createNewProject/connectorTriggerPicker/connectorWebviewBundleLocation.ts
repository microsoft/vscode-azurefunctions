/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type WebviewBundleLocation } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import { type ExtensionContext } from 'vscode';

/** Locates a webview bundle that esbuild.mjs builds into dist/webview. */
export function getConnectorWebviewBundleLocation(
    context: ExtensionContext,
    bundleName: 'connectorTriggerPicker' | 'connectorTriggerSetup',
): WebviewBundleLocation {
    return {
        distDir: path.join(context.extensionPath, 'dist', 'webview'),
        scriptFileName: `${bundleName}.js`,
        styleFileName: `${bundleName}.css`,
    };
}
