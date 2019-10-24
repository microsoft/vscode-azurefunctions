/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ext } from "../../extensionVariables";
import { FuncVersion } from '../../FuncVersion';
import { cpUtils } from "../../utils/cpUtils";

export async function executeDotnetTemplateCommand(version: FuncVersion, workingDirectory: string | undefined, operation: 'list' | 'create', ...args: string[]): Promise<string> {
    const jsonDllPath: string = ext.context.asAbsolutePath(path.join('resources', 'dotnetJsonCli', 'Microsoft.TemplateEngine.JsonCli.dll'));
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
