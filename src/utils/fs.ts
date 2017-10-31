/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
// tslint:disable-next-line:no-require-imports
import rimraf = require('rimraf');

export async function writeJsonToFile(fsPath: string, data: object): Promise<void> {
    await writeToFile(fsPath, JSON.stringify(data, undefined, 2));
}

export async function writeToFile(fsPath: string, data: string): Promise<void> {
    await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
        fs.writeFile(fsPath, data, (error?: Error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

export async function readFromFile(fsPath: string): Promise<string> {
    return await new Promise((resolve: (data: string) => void, reject: (e: Error) => void): void => {
        fs.readFile(fsPath, (error: Error | undefined, data: Buffer) => {
            if (error) {
                reject(error);
            } else {
                resolve(data.toString());
            }
        });
    });
}

export async function makeFolder(fsPath: string): Promise<void> {
    if (!(await fsPathExists(fsPath))) {
        await new Promise((resolve: () => void, reject: (err: Error) => void): void => {
            fs.mkdir(fsPath, (err?: Error) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

export async function deleteFolderAndContents(fsPath: string): Promise<void> {
    await new Promise((resolve: () => void, reject: (err: Error) => void): void => {
        rimraf(fsPath, (err?: Error) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export async function fsPathExists(fsPath: string): Promise<boolean> {
    return await new Promise((resolve: (r: boolean) => void, reject: (e: Error) => void): void => {
        fs.exists(fsPath, (result: boolean, error?: Error) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

export async function getUniqueFsPath(folderPath: string, defaultValue: string): Promise<string | undefined> {
    let count: number = 0;
    const maxCount: number = 1024;

    while (count < maxCount) {
        const fileName: string = defaultValue + (count === 0 ? '' : count.toString());
        if (!(await fsPathExists(path.join(folderPath, fileName)))) {
            return fileName;
        }
        count += 1;
    }

    return undefined;
}

export function randomName(): string {
    // tslint:disable-next-line:insecure-random
    return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10);
}
