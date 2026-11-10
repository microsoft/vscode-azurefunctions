/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoEsbuildOrWatch, autoSelectEsbuildConfig, copyPlugin, isAutoWatch } from '@microsoft/vscode-azext-eng/esbuild';
import { context } from 'esbuild';
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

const webviewBuild = await context({
    entryPoints: {
        views: 'src/webviews/azureInvoke/views/httpRequestView.ts',
        blobInvocation: 'src/webviews/azureInvoke/views/blobInvocation.ts',
        timerInvocation: 'src/webviews/azureInvoke/views/timerInvocation.ts',
    },
    outdir: 'dist/azureInvoke',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    sourcemap: isAutoWatch,
    minify: !isAutoWatch,
});

await webviewBuild.rebuild();
if (isAutoWatch) {
    process.on('SIGINT', () => void webviewBuild.dispose());
    await webviewBuild.watch();
} else {
    await webviewBuild.dispose();
}
