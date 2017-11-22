/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from "crypto";
import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { DialogResponses } from "../DialogResponses";
import { localize } from "../localize";

export async function writeFormattedJson(fsPath: string, data: object): Promise<void> {
    await fse.writeJson(fsPath, data, { spaces: 2 });
}

export async function copyFolder(fromPath: string, toPath: string): Promise<void> {
    const files: string[] = await fse.readdir(fromPath);
    for (const file of files) {
        const originPath: string = path.join(fromPath, file);
        const stat: fse.Stats = await fse.stat(originPath);
        const targetPath: string = path.join(toPath, file);
        if (stat.isFile()) {
            if (await confirmOverwriteFile(targetPath)) {
                await fse.copy(originPath, targetPath, { overwrite: true });
            }
        } else if (stat.isDirectory()) {
            await copyFolder(originPath, targetPath);
        }
    }
}

export async function confirmOverwriteFile(fsPath: string): Promise<boolean> {
    if (await fse.pathExists(fsPath)) {
        const result: string | undefined = await vscode.window.showWarningMessage(localize('azFunc.fileAlreadyExists', 'File "{0}" already exists. Overwrite?', fsPath), DialogResponses.yes, DialogResponses.no);
        if (result === undefined) {
            throw new UserCancelledError();
        } else {
            return result === DialogResponses.yes;
        }
    } else {
        return true;
    }
}

export async function getUniqueFsPath(folderPath: string, defaultValue: string): Promise<string | undefined> {
    let count: number = 0;
    const maxCount: number = 1024;

    while (count < maxCount) {
        const fileName: string = defaultValue + (count === 0 ? '' : count.toString());
        if (!(await fse.pathExists(path.join(folderPath, fileName)))) {
            return fileName;
        }
        count += 1;
    }

    return undefined;
}

export function getRandomHexString(length: number = 10): string {
    const buffer: Buffer = crypto.randomBytes(Math.ceil(length / 2));
    return buffer.toString('hex').slice(0, length);
}

export function isPathEqual(fsPath1: string, fsPath2: string, relativeFunc: pathRelativeFunc = path.relative): boolean {
    const relativePath: string = relativeFunc(fsPath1, fsPath2);
    return relativePath === '';
}

export function isSubPath(expectedParent: string, expectedChild: string, relativeFunc: pathRelativeFunc = path.relative): boolean {
    const relativePath: string = relativeFunc(expectedParent, expectedChild);
    return relativePath !== '' && !relativePath.startsWith('..') && relativePath !== expectedChild;
}

type pathRelativeFunc = (fsPath1: string, fsPath2: string) => string;
