/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoEsbuildOrWatch, autoSelectEsbuildConfig, isAutoWatch } from '@microsoft/vscode-azext-eng/esbuild';
import { context } from 'esbuild';
import { copy } from 'esbuild-plugin-copy';

const configs = autoSelectEsbuildConfig();

// The default esbuild config only copies root-level SVGs from vscode-azext-azureutils/resources/*.svg.
// We additionally copy the azureIcons subdirectory so that getAzureIconPath() (used by
// RoleDefinitionsTreeItem and other tree items from vscode-azext-azureutils) can resolve icons at runtime.
configs.extensionConfig = {
    ...configs.extensionConfig,
    plugins: [
        ...(configs.extensionConfig.plugins ?? []),
        copy({
            assets: [
                {
                    from: './node_modules/@microsoft/vscode-azext-azureutils/resources/azureIcons/*.svg',
                    to: './node_modules/@microsoft/vscode-azext-azureutils/resources/azureIcons',
                },
            ],
        }),
    ],
};

await autoEsbuildOrWatch(configs);

const webviewBuild = await context({
    entryPoints: { views: 'src/webviews/azureInvoke/views/httpRequestView.ts' },
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
