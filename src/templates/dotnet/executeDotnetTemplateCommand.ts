/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ext } from "../../extensionVariables";
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { cpUtils } from "../../utils/cpUtils";

export async function executeDotnetTemplateCommand(version: FuncVersion, workingDirectory: string | undefined, operation: 'list' | 'create', ...args: string[]): Promise<string> {
    const framework: string = await getFramework(workingDirectory);
    const jsonDllPath: string = ext.context.asAbsolutePath(path.join('resources', 'dotnetJsonCli', framework, 'Microsoft.TemplateEngine.JsonCli.dll'));
    return await cpUtils.executeCommand(
        undefined,
        workingDirectory,
        'dotnet',
        cpUtils.wrapArgInQuotes(jsonDllPath),
        '--require',
        cpUtils.wrapArgInQuotes(getDotnetItemTemplatePath(version)),
        '--require',
        cpUtils.wrapArgInQuotes(getDotnetProjectTemplatePath(version)),
        '--operation',
        operation,
        ...args);
}

export function getDotnetTemplatesPath(): string {
    // tslint:disable-next-line:strict-boolean-expressions
    return path.join(ext.context.globalStoragePath, 'dotnetTemplates', ext.templateProvider.templateSource || '');
}

export function getDotnetItemTemplatePath(version: FuncVersion): string {
    return path.join(getDotnetTemplatesPath(), `itemTemplates-${version}.nupkg`);
}

export function getDotnetProjectTemplatePath(version: FuncVersion): string {
    return path.join(getDotnetTemplatesPath(), `projectTemplates-${version}.nupkg`);
}

let cachedFramework: string | undefined;
async function getFramework(workingDirectory: string | undefined): Promise<string> {
    if (!cachedFramework) {
        let versions: string = '';
        try {
            versions += await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', '--version');
        } catch {
            // ignore
        }

        try {
            versions += await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', '--list-sdks');
        } catch {
            // ignore
        }

        const majorVersions: string[] = ['3', '2'];
        for (const majorVersion of majorVersions) {
            const regExp: RegExp = new RegExp(`^\\s*${majorVersion}\\.`);
            if (regExp.test(versions)) {
                cachedFramework = `netcoreapp${majorVersion}.0`;
                break;
            }
        }

        if (!cachedFramework) {
            throw new Error(localize('noMatchingFramework', 'You must have version 2.x or 3.x of the .NET Core SDK installed to perform this operation.'));
        }
    }

    return cachedFramework;
}
