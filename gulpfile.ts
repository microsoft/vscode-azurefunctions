/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as msRest from '@azure/ms-rest-js';
import { gulp_webpack } from '@microsoft/vscode-azext-dev';
import * as fse from 'fs-extra';
import * as gulp from 'gulp';
import * as chmod from 'gulp-chmod';
import * as decompress from 'gulp-decompress';
import * as filter from 'gulp-filter';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as buffer from 'vinyl-buffer';
import * as source from 'vinyl-source-stream';

async function prepareForWebpack(): Promise<void> {
    const mainJsPath: string = path.join(__dirname, 'main.js');
    let contents: string = (await fse.readFile(mainJsPath)).toString();
    contents = contents
        .replace('out/src/extension', 'dist/extension.bundle')
        .replace(', true /* ignoreBundle */', '');
    await fse.writeFile(mainJsPath, contents);
}

let downloadLink: string;
async function getFuncLink() {
    const client = new msRest.ServiceClient();
    const cliFeed = JSON.parse((await client.sendRequest({ method: 'GET', url: 'https://aka.ms/V00v5v' })).bodyAsText as string);
    const version = cliFeed.tags['v4-prerelease'].release;
    console.log(`Func cli feed version: ${version}`);
    const cliRelease = cliFeed.releases[version].coreTools.find((rel) => {
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

async function cleanReadme() {
    const readmePath: string = path.join(__dirname, 'README.md');
    let data: string = (await fse.readFile(readmePath)).toString();
    data = data.replace(/<!-- region exclude-from-marketplace -->.*?<!-- endregion exclude-from-marketplace -->/gis, '');
    await fse.writeFile(readmePath, data);
}

async function installFuncCli() {
    const funcDir = path.join(os.homedir(), 'tools', 'func');
    if (fse.pathExistsSync(funcDir)) {
        console.log('Removing old install of func.');
        fse.removeSync(funcDir);
    }

    try {
        await httpsGetAndInstallFuncCli(downloadLink, funcDir);
        console.log('Successfully installed the func CLI at ' + funcDir);
    } catch (e) {
        console.log('Failed to install the func CLI at ' + funcDir);
        console.error(e);
    }
}

function httpsGetAndInstallFuncCli(url: string, funcDir: string): Promise<void> {
    const funcFilter = filter('func', { restore: true });

    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                reject(new Error('Request for func CLI responded with status code: ' + response.statusCode));
                return;
            }

            const pipeline: NodeJS.ReadWriteStream = response
                .pipe(source('funccli.zip'))
                .pipe(buffer())
                .pipe(decompress())
                .pipe(funcFilter)
                .pipe(chmod({ execute: true }))
                .pipe(funcFilter.restore)
                .pipe(gulp.dest(funcDir));

            response.on('error', (error) => reject(new Error('Response error: ' + error.message)));
            pipeline.on('error', (error) => reject(new Error('Pipeline processing error: ' + error.message)));
            pipeline.on('end', resolve);
            pipeline.on('finish', resolve);
        });

        request.on('error', (error) => reject(new Error('Failed to make GET request: ' + error.message)));
    });
}

exports['webpack-dev'] = gulp.series(prepareForWebpack, () => gulp_webpack('development'));
exports['webpack-prod'] = gulp.series(prepareForWebpack, () => gulp_webpack('production'));
exports.preTest = gulp.series(getFuncLink, installFuncCli);
exports.cleanReadme = cleanReadme;
