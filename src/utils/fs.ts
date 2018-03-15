/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from "crypto";
import * as fse from 'fs-extra';
import * as path from 'path';
import { MessageItem } from "vscode";
import { DialogResponses, IAzureUserInput } from "vscode-azureextensionui";
import { localize } from "../localize";
import { parseJavaClassName } from './javaNameUtils';

export async function writeFormattedJson(fsPath: string, data: object): Promise<void> {
    await fse.writeJson(fsPath, data, { spaces: 2 });
}

export async function copyFolder(fromPath: string, toPath: string, ui: IAzureUserInput): Promise<void> {
    const files: string[] = await fse.readdir(fromPath);
    for (const file of files) {
        const originPath: string = path.join(fromPath, file);
        const stat: fse.Stats = await fse.stat(originPath);
        const targetPath: string = path.join(toPath, file);
        if (stat.isFile()) {
            if (await confirmOverwriteFile(targetPath, ui)) {
                await fse.copy(originPath, targetPath, { overwrite: true });
            }
        } else if (stat.isDirectory()) {
            await copyFolder(originPath, targetPath, ui);
        }
    }
}

export async function confirmEditJsonFile(fsPath: string, editJson: (existingData: {}) => {}, ui: IAzureUserInput): Promise<void> {
    let newData: {};
    if (await fse.pathExists(fsPath)) {
        try {
            newData = editJson(<{}>await fse.readJson(fsPath));
        } catch (error) {
            // If we failed to parse or edit the existing file, just ask to overwrite the file completely
            if (await confirmOverwriteFile(fsPath, ui)) {
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

export async function confirmOverwriteFile(fsPath: string, ui: IAzureUserInput): Promise<boolean> {
    if (await fse.pathExists(fsPath)) {
        const result: MessageItem | undefined = await ui.showWarningMessage(localize('azFunc.fileAlreadyExists', 'File "{0}" already exists. Overwrite?', fsPath), DialogResponses.yes, DialogResponses.no, DialogResponses.cancel);
        if (result === DialogResponses.yes) {
            return true;
        } else {
            return false;
        }
    } else {
        return true;
    }
}

export async function getUniqueFsPath(folderPath: string, defaultValue: string, fileExtension?: string): Promise<string | undefined> {
    let count: number = 0;
    const maxCount: number = 1024;

    while (count < maxCount) {
        const fileName: string = defaultValue + (count === 0 ? '' : count.toString());
        if (!(await fse.pathExists(path.join(folderPath, fileExtension ? `${fileName}${fileExtension}` : fileName)))) {
            return fileName;
        }
        count += 1;
    }
    return undefined;
}

export async function getUniqueJavaFsPath(basePath: string, packageName: string, defaultValue: string): Promise<string | undefined> {
    return getUniqueFsPath(path.join(basePath, 'src', 'main', 'java', ...packageName.split('.')), parseJavaClassName(defaultValue), '.java');
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
