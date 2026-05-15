/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Copies the prebuilt webview bundle (views.js / views.css) from the shared
// @microsoft/vscode-azext-webview package into dist/webview so that the
// bundled VSIX contains the assets without depending on node_modules at runtime.
//
// During local development with a `file:` dependency, the package's
// `node_modules/@microsoft/vscode-azext-webview` is a cached copy that can be
// stale after the source repo is rebuilt. To avoid that, we prefer reading the
// freshly-built assets directly from the sibling source repo when available,
// and fall back to node_modules otherwise.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Resolve candidate source directories in priority order.
const candidates = [
    // Sibling source repo (fresh builds during local development)
    path.resolve(repoRoot, '..', 'vscode-azuretools', 'webview', 'dist'),
    // npm-installed copy (works for clean clones)
    path.resolve(repoRoot, 'node_modules', '@microsoft', 'vscode-azext-webview', 'dist'),
];

const pkgDist = candidates.find(p => fs.existsSync(path.join(p, 'views.js')));
const outDir = path.resolve(repoRoot, 'dist', 'webview');

const filesToCopy = ['views.js', 'views.css'];

if (!pkgDist) {
    console.error('[copyWebviewAssets] Could not find @microsoft/vscode-azext-webview build output.');
    console.error('Looked in:');
    for (const c of candidates) {
        console.error(`  - ${c}`);
    }
    console.error('Build the package (cd ../vscode-azuretools/webview && npm run build) or run `npm install`.');
    process.exit(1);
}

console.log(`[copyWebviewAssets] Source: ${pkgDist}`);

fs.mkdirSync(outDir, { recursive: true });

for (const f of filesToCopy) {
    const src = path.join(pkgDist, f);
    const dst = path.join(outDir, f);
    if (!fs.existsSync(src)) {
        console.error(`[copyWebviewAssets] Missing asset: ${src}`);
        process.exit(1);
    }
    fs.copyFileSync(src, dst);
    console.log(`[copyWebviewAssets] ${f} -> ${path.relative(repoRoot, dst)}`);
}
