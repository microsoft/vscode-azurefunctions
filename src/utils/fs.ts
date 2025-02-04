/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, DialogResponses, parseError, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as crypto from "crypto";
import * as path from 'path';
import { FileType, type MessageItem } from "vscode";
import { localize } from "../localize";

export async function copyFolder(context: IActionContext, fromPath: string, toPath: string): Promise<void> {
    const files = await AzExtFsExtra.readDirectory(fromPath);
    for (const file of files) {
        const originPath: string = path.join(fromPath, file.name);
        const targetPath: string = path.join(toPath, file.name);
        if (file.type === FileType.File) {
            if (await confirmOverwriteFile(context, targetPath)) {
                await AzExtFsExtra.copy(originPath, targetPath, { overwrite: true });
            }
        } else if (file.type === FileType.Directory) {
            await copyFolder(context, originPath, targetPath);
        }
    }
}

export async function confirmEditJsonFile(context: IActionContext, fsPath: string, editJson: (existingData: {}) => {} | Promise<{}>): Promise<void> {
    let newData: {};
    if (await AzExtFsExtra.pathExists(fsPath)) {
        try {
            newData = await editJson(await AzExtFsExtra.readJSON<{}>(fsPath));
        } catch (error) {
            if (parseError(error).isUserCancelledError) {
                throw error;
            } else if (await confirmOverwriteFile(context, fsPath)) {
                // If we failed to parse or edit the existing file, just ask to overwrite the file completely
                newData = await editJson({});
            } else {
                return;
            }
        }
    } else {
        newData = await editJson({});
    }

    await AzExtFsExtra.writeJSON(fsPath, newData);
}

export async function confirmOverwriteFile(context: IActionContext, fsPath: string): Promise<boolean> {
    if (await AzExtFsExtra.pathExists(fsPath)) {
        const result: MessageItem | undefined = await context.ui.showWarningMessage(localize('fileAlreadyExists', 'File "{0}" already exists. Overwrite?', fsPath), { modal: true, stepName: 'overwriteFile' }, DialogResponses.yes, DialogResponses.no);
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

export function getRandomAlphanumericString(): string {
    // toString(36) to convert it into base 36 (26 char + 0 to 9) and slice(2) to remove the '0.'
    return Math.random().toString(36).slice(2);
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
