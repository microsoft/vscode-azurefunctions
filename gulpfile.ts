/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as msRest from '@azure/ms-rest-js';
import { gulp_webpack } from '@microsoft/vscode-azext-dev';
import { exec } from 'child_process';
import * as extract from 'extract-zip';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as gulp from 'gulp';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';

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

const funcDir = path.join(os.homedir(), 'tools', 'func');
const funcZip = 'funccli.zip';
const funcExecutable = process.platform === 'win32' ? 'func.exe' : 'func';

async function downloadFuncCli() {
    if (fse.pathExistsSync(funcDir)) {
        console.log('Removing old install of func.');
        fse.removeSync(funcDir);
    }

    const fullFuncZipPath = path.join(funcDir, funcZip);
    await fse.ensureFile(fullFuncZipPath);

    try {
        await getFuncDownload(downloadLink, fullFuncZipPath);
        console.log('Successfully downloaded the func CLI zip at ' + fullFuncZipPath);
    } catch (e) {
        console.log('Failed to download the func CLI zip at ' + fullFuncZipPath);
        console.error(e);
        throw e;
    }
}

function getFuncDownload(url: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error('Request for func CLI responded with status code: ' + response.statusCode));
                return;
            }
            response.on('error', (error) => reject(new Error('Response error: ' + error.message)));

            const pipeline = response.pipe(fs.createWriteStream(targetPath));
            pipeline.on('error', (error) => reject(new Error('Write error: ' + error.message)));
            pipeline.on('finish', resolve);
        });

        request.on('error', (error) => reject(new Error('Failed to make GET request: ' + error.message)));
    });
}

async function extractFuncCli() {
    const fullFuncZipPath: string = path.join(funcDir, funcZip);

    try {
        // Extract
        await extract(fullFuncZipPath, { dir: funcDir });
        console.log('Successfully extracted func CLI.');

        // chmod +x
        console.log('Verifying func executable...');
        await fse.chmod(path.join(funcDir, funcExecutable), 755);
        console.log('Successfully verified func executable.');
    } catch (e) {
        console.log('Failed to install func CLI.')
        console.error(e);
        throw e;
    } finally {
        await fse.remove(fullFuncZipPath);
    }
}

async function printFuncVersion() {
    const funcExecutablePath = path.join(funcDir, funcExecutable);

    await new Promise<void>((resolve, reject) => {
        exec(`"${funcExecutablePath}" --version`, (error, stdout, stderr) => {
            if (stderr || error) {
                const failed = new Error(`Failed to verify: ${stderr || error}`);
                console.error(failed);
                reject(failed);
            } else {
                console.log(`Verified func CLI version:\n${stdout}`);
                resolve();
            }
        });
    });
}

exports['webpack-dev'] = gulp.series(prepareForWebpack, () => gulp_webpack('development'));
exports['webpack-prod'] = gulp.series(prepareForWebpack, () => gulp_webpack('production'));
exports.preTest = gulp.series(getFuncLink, downloadFuncCli, extractFuncCli, printFuncVersion);
exports.cleanReadme = cleanReadme;
