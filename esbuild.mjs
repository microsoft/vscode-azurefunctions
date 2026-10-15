/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoEsbuildOrWatch, autoSelectEsbuildConfig, copyPlugin } from '@microsoft/vscode-azext-eng/esbuild';
import { existsSync } from 'node:fs';

// Prefer fresh sibling builds over the cached file: dependency during local development.
const webviewDist = existsSync('../vscode-azuretools/webview/dist/views.js')
    ? '../vscode-azuretools/webview/dist'
    : './node_modules/@microsoft/vscode-azext-webview/dist';

const webviewAssets = ['views.js', 'views.css'];
const configs = autoSelectEsbuildConfig();
configs.extension.plugins.push(
    {
        name: 'validate-webview-assets',
        setup(build) {
            build.onStart(() => {
                for (const file of webviewAssets) {
                    const source = `${webviewDist}/${file}`;
                    if (!existsSync(source)) {
                        throw new Error(`Missing webview asset: ${source}`);
                    }
                }
            });
        },
    },
    copyPlugin({ assets: [{ from: webviewDist, to: 'webview', include: webviewAssets }] }),
);

await autoEsbuildOrWatch(configs);
