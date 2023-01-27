/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { requirementsFileName } from "../constants";
import { ext } from "../extensionVariables";
import { localize } from "../localize";

export namespace pythonUtils {
    export async function addDependencyToRequirements(dependency: string, projectPath: string): Promise<void> {
        const requirementsPath: string = path.join(projectPath, requirementsFileName);
        if (await hasDependencyInRequirements(dependency, requirementsPath)) {
            return;
        }

        const contents: string = await AzExtFsExtra.readFile(requirementsPath);
        const lines: string[] = contents.split('\n');

        // Trim any empty lines from the end before adding new dependency
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) {
                lines.pop();
            } else {
                break;
            }
        }

        lines.push(dependency);
        await AzExtFsExtra.writeFile(requirementsPath, lines.join('\n'));

        const added: string = localize('addedPythonDependency', 'Added Python dependency: "{0}"', dependency);
        ext.outputChannel.appendLog(added);
    }

    export async function hasDependencyInRequirements(dependency: string, filePath: string): Promise<boolean> {
        if (!await AzExtFsExtra.pathExists(filePath)) {
            throw new Error(localize('requirementsTextNotFound', `The "${requirementsFileName}" file could not be found.`));
        }

        const contents: string = await AzExtFsExtra.readFile(filePath);
        const lines: string[] = contents.split('\n');

        for (let line of lines) {
            line = line.trim();
            if (line === dependency) {
                return true;
            }
        }

        return false;
    }
}
