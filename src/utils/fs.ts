/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from "crypto";
import * as fse from 'fs-extra';
import * as path from 'path';
import { MessageItem } from "vscode";
import { DialogResponses } from "vscode-azureextensionui";
import { ext } from "../extensionVariables";
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

export async function confirmEditJsonFile(fsPath: string, editJson: (existingData: {}) => {}): Promise<void> {
    let newData: {};
    if (await fse.pathExists(fsPath)) {
        try {
            newData = editJson(<{}>await fse.readJson(fsPath));
        } catch (error) {
            // If we failed to parse or edit the existing file, just ask to overwrite the file completely
            if (await confirmOverwriteFile(fsPath)) {
                newData = editJson({});
            } else {
                return;
            }
        }
    } else {
        newData = editJson({});
    }

    await writeFormattedJson(fsPath, newData);
}

export async function confirmOverwriteFile(fsPath: string): Promise<boolean> {
    if (await fse.pathExists(fsPath)) {
        const result: MessageItem | undefined = await ext.ui.showWarningMessage(localize('fileAlreadyExists', 'File "{0}" already exists. Overwrite?', fsPath), { modal: true }, DialogResponses.yes, DialogResponses.no, DialogResponses.cancel);
        if (result === DialogResponses.yes) {
            return true;
        } else {
            return false;
        }
    } else {
        return true;
    }
}

export function getRandomHexString(length: number = 10): string {
    const buffer: Buffer = crypto.randomBytes(Math.ceil(length / 2));
    return buffer.toString('hex').slice(0, length);
}

export function isPathEqual(fsPath1: string, fsPath2: string, relativeFunc: pathRelativeFunc = path.relative): boolean {
    const relativePath: string = relativeFunc(fsPath1, fsPath2);
    return relativePath === '';
}

export function isSubpath(expectedParent: string, expectedChild: string, relativeFunc: pathRelativeFunc = path.relative): boolean {
    const relativePath: string = relativeFunc(expectedParent, expectedChild);
    return relativePath !== '' && !relativePath.startsWith('..') && relativePath !== expectedChild;
}

type pathRelativeFunc = (fsPath1: string, fsPath2: string) => string;
