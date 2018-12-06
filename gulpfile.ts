/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Grandfathered in
// tslint:disable:no-console
// tslint:disable:no-implicit-dependencies
// tslint:disable:typedef
// tslint:disable:no-unsafe-any

import * as cp from 'child_process';
import * as fse from 'fs-extra';
import * as glob from 'glob';
import * as gulp from 'gulp';
import * as chmod from 'gulp-chmod';
import * as decompress from 'gulp-decompress';
import * as download from 'gulp-download';
import * as filter from 'gulp-filter';
import * as os from 'os';
import * as path from 'path';
import * as requestP from 'request-promise';

function test() {
    const env = process.env;
    env.DEBUGTELEMETRY = '1';
    env.MOCHA_timeout = String(10 * 1000);
    env.MOCHA_reporter = 'mocha-junit-reporter';
    env.MOCHA_FILE = path.join(__dirname, 'test-results.xml');
    return cp.spawn('node', ['./node_modules/vscode/bin/test'], { stdio: 'inherit', env });
}

/**
 * Installs the azure account extension before running tests (otherwise our extension would fail to activate)
 * NOTE: The version isn't super important since we don't actually use the account extension in tests
 */
function installAzureAccount() {
    const version = '0.4.3';
    const extensionPath = path.join(os.homedir(), `.vscode/extensions/ms-vscode.azure-account-${version}`);
    const existingExtensions = glob.sync(extensionPath.replace(version, '*'));
    if (existingExtensions.length === 0) {
        // tslint:disable-next-line:no-http-string
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
        return Promise.resolve();
    }
}

let downloadLink;
async function getFuncLink() {
    // tslint:disable-next-line:no-any
    const body = await <any>requestP('https://aka.ms/V00v5v');
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
}

function matchesCliFeedOS(platform: string) {
    switch (process.platform) {
        case 'win32':
            return platform === 'Windows';
        case 'darwin':
            return platform === 'MacOS';
        default:
            return platform === 'Linux';
    }
}

function installFuncCli() {
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
        .pipe(gulp.dest(funcDir));
}

exports.test = gulp.series(installAzureAccount, getFuncLink, installFuncCli, test);
