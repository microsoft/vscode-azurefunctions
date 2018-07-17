/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ProjectRuntime } from '../constants';
import { ext } from "../extensionVariables";
import { cpUtils } from "../utils/cpUtils";

export async function executeDotnetTemplateCommand(runtime: ProjectRuntime, workingDirectory: string | undefined, operation: 'list' | 'create', ...args: string[]): Promise<string> {
    const jsonDllPath: string = ext.context.asAbsolutePath(path.join('resources', 'dotnetJsonCli', 'Microsoft.TemplateEngine.JsonCli.dll'));
    return await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', jsonDllPath, '--require', getDotnetItemTemplatePath(runtime), '--require', getDotnetProjectTemplatePath(runtime), '--operation', operation, ...args);
}

export function getDotnetTemplatesPath(): string {
    return ext.context.asAbsolutePath(path.join('resources', 'dotnetTemplates'));
}

export function getDotnetItemTemplatePath(runtime: ProjectRuntime): string {
    return path.join(getDotnetTemplatesPath(), `itemTemplates-${runtime}.nupkg`);
}

export function getDotnetProjectTemplatePath(runtime: ProjectRuntime): string {
    return path.join(getDotnetTemplatesPath(), `projectTemplates-${runtime}.nupkg`);
}
