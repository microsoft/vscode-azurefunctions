/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from "vscode-azureextensionui";
import { ProjectLanguage } from '../constants';
import { localize } from "../localize";
import { cpUtils } from "./cpUtils";
import { openUrl } from './openUrl';

export namespace dotnetUtils {
    export async function isDotnetInstalled(): Promise<boolean> {
        try {
            await cpUtils.executeCommand(undefined, undefined, 'dotnet', '--version');
            return true;
        } catch (error) {
            return false;
        }
    }

    export async function validateDotnetInstalled(context: IActionContext): Promise<void> {
        if (!await isDotnetInstalled()) {
            const message: string = localize('dotnetNotInstalled', 'You must have the .NET CLI installed to perform this operation.');

            if (!context.errorHandling.suppressDisplay) {
                // don't wait
                vscode.window.showErrorMessage(message, DialogResponses.learnMore).then(async (result) => {
                    if (result === DialogResponses.learnMore) {
                        await openUrl('https://aka.ms/AA4ac70');
                    }
                });
                context.errorHandling.suppressDisplay = true;
            }

            throw new Error(message);
        }
    }

    export function getDotnetDebugSubpath(targetFramework: string): string {
        return path.posix.join('bin', 'Debug', targetFramework);
    }

    /**
     * NOTE: 'extensions.csproj' is excluded as it has special meaning for the func cli
     */
    export async function getProjFiles(projectLanguage: ProjectLanguage, projectPath: string): Promise<string[]> {
        const regexp: RegExp = projectLanguage === ProjectLanguage.FSharp ? /\.fsproj$/i : /\.csproj$/i;
        const files: string[] = await fse.readdir(projectPath);
        return files.filter((f: string) => regexp.test(f) && !/extensions\.csproj$/i.test(f));
    }

    export async function getTargetFramework(projFilePath: string): Promise<string> {
        return await getPropertyInProjFile(projFilePath, 'TargetFramework');
    }

    export async function getPropertyInProjFile(projFilePath: string, prop: string): Promise<string> {
        const projContents: string = (await fse.readFile(projFilePath)).toString();
        const regExp: RegExp = new RegExp(`<${prop}>(.*)<\\/${prop}>`);
        const matches: RegExpMatchArray | null = projContents.match(regExp);
        if (!matches) {
            throw new Error(localize('failedToFindProp', 'Failed to find "{0}" in project file "{1}".', prop, projFilePath));
        } else {
            return matches[1];
        }
    }
}
