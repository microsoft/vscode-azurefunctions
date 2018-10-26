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
const packageJson = require('./package.json');
const request = require('request');
const chmod = require('gulp-chmod');
const filter = require('gulp-filter');

gulp.task('set-vsix-name', () => {
    const vsixName = `${packageJson.name}-${packageJson.version}.vsix`;
    console.log(`##vso[task.setvariable variable=vsixName]${vsixName}`);
});

gulp.task('test', ['install-azure-account', 'install-func-cli'], (cb) => {
    const env = process.env;
    env.DEBUGTELEMETRY = 1;
    env.MOCHA_timeout = 10 * 1000;
    env.MOCHA_reporter = 'mocha-junit-reporter';
    env.MOCHA_FILE = path.join(__dirname, 'test-results.xml');
    const cmd = cp.spawn('node', ['./node_modules/vscode/bin/test'], { stdio: 'inherit', env });
    cmd.on('close', (code) => {
        cb(code);
    });
});

gulp.task('install-azure-account', () => {
    const version = '0.3.0';
    const extensionPath = path.join(os.homedir(), `.vscode/extensions/ms-vscode.azure-account-${version}`);
    if (!fse.pathExistsSync(extensionPath)) {
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


let downloadLink;
gulp.task('get-func-link', (cb) => {
    request('https://aka.ms/V00v5v', (error, _response, body) => {
        if (error) {
            cb(error);
        }

        const cliFeed = JSON.parse(body);
        const version = cliFeed.tags['v2-prerelease'].release;
        console.log(`Func cli feed version: ${version}`);
        const cliRelease = cliFeed.releases[version].standaloneCli.find((rel) => {
            return rel.Architecture === 'x64' && (
                matchesCliFeedOS(rel.OperatingSystem) ||
                matchesCliFeedOS(rel.OS)
            );
        });

        downloadLink = cliRelease.downloadLink;
        console.log(`Func downloadLink: ${downloadLink}`);
        cb();
    });
});

function matchesCliFeedOS(os) {
    switch (process.platform) {
        case 'win32':
            return os === 'Windows';
        case 'darwin':
            return os === 'MacOS';
        default:
            return os === 'Linux';
    }
}

gulp.task('install-func-cli', ['get-func-link'], () => {
    const funcDir = path.join(os.homedir(), 'tools', 'func');
    if (fse.pathExistsSync(funcDir)) {
        console.log('Removing old install of func.');
        fse.removeSync(funcDir);
    }

    const funcFilter = filter('func', { restore: true });
    return download(downloadLink)
        .pipe(decompress())
        .pipe(funcFilter)
        .pipe(chmod({ execute: true }))
        .pipe(funcFilter.restore)
        .pipe(gulp.dest(funcDir))
});
