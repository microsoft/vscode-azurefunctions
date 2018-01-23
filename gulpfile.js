/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const gulp = require('gulp');
const decompress = require('gulp-decompress');
const download = require('gulp-download');
const path = require('path');
const os = require('os');
const fse = require('fs-extra');
const cp = require('child_process');

gulp.task('test', ['install-azure-account'], (cb) => {
    const cmd = cp.spawn('node', ['./node_modules/vscode/bin/test'], { stdio: 'inherit' });
    cmd.on('close', (code) => {
        cb(code);
    });
});

gulp.task('install-azure-account', async () => {
    const version = '0.3.0';
    const extensionPath = path.join(os.homedir(), `.vscode/extensions/ms-vscode.azure-account-${version}`);
    if (!await fse.pathExists(extensionPath)) {
        return download(`http://ms-vscode.gallery.vsassets.io/_apis/public/gallery/publisher/ms-vscode/extension/azure-account/${version}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`)
            .pipe(decompress({
                filter: file => file.path.startsWith('extension/'),
                map: file => {
                    file.path = file.path.slice(10);
                    return file;
                }
            }))
            .pipe(gulp.dest(extensionPath));
    } else {
        console.log('Azure Account extension already installed.');
    }
});
