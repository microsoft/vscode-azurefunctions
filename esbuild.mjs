/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoEsbuildOrWatch, autoSelectEsbuildConfig, copyPlugin, createWebviewEsbuildConfig } from '@microsoft/vscode-azext-eng/esbuild';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
configs.connectorTriggerPicker = createWebviewEsbuildConfig({
    entryPoints: {
        connectorTriggerPicker: './src/webview/connectorTriggerPicker/index.tsx',
    },
    jsx: 'automatic',
    outdir: './dist/webview',
    plugins: [
        {
            name: 'tree-shake-fluent-components',
            setup(build) {
                build.onResolve({ filter: /^@fluentui\/react-components$/ }, () => ({
                    path: resolve('./src/webview/fluentComponents.mjs'),
                }));
            },
        },
    ],
});

await autoEsbuildOrWatch(configs);
