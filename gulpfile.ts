/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable:no-console
// tslint:disable:no-implicit-dependencies (this allows the use of dev dependencies)

// Grandfathered in
// tslint:disable:typedef
// tslint:disable:no-unsafe-any

import * as cp from 'child_process';
import * as fse from 'fs-extra';
import * as gulp from 'gulp';
import * as chmod from 'gulp-chmod';
import * as decompress from 'gulp-decompress';
import * as download from 'gulp-download';
import * as filter from 'gulp-filter';
import * as os from 'os';
import * as path from 'path';
import * as requestP from 'request-promise';
import { gulp_installAzureAccount, gulp_webpack } from 'vscode-azureextensiondev';

function test() {
    const env = process.env;
    env.DEBUGTELEMETRY = '1';
    env.MOCHA_timeout = String(10 * 1000);
    env.CODE_TESTS_PATH = path.join(__dirname, 'dist/test');
    return cp.spawn('node', ['./node_modules/vscode/bin/test'], { stdio: 'inherit', env });
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

exports['webpack-dev'] = () => gulp_webpack('development');
exports['webpack-prod'] = () => gulp_webpack('production');
exports.test = gulp.series(gulp_installAzureAccount, getFuncLink, installFuncCli, test);
