/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from "../../extensionVariables";
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { cpUtils } from "../../utils/cpUtils";

export async function executeDotnetTemplateCommand(context: IActionContext, version: FuncVersion, projTemplateKey: string, workingDirectory: string | undefined, operation: 'list' | 'create', ...args: string[]): Promise<string> {
    const framework: string = await getFramework(context, workingDirectory);
    const jsonDllPath: string = ext.context.asAbsolutePath(path.join('resources', 'dotnetJsonCli', framework, 'Microsoft.TemplateEngine.JsonCli.dll'));
    return await cpUtils.executeCommand(
        undefined,
        workingDirectory,
        'dotnet',
        cpUtils.wrapArgInQuotes(jsonDllPath),
        '--templateDir',
        cpUtils.wrapArgInQuotes(getDotnetTemplateDir(context, version, projTemplateKey)),
        '--operation',
        operation,
        ...args);
}

export function getDotnetItemTemplatePath(context: IActionContext, version: FuncVersion, projTemplateKey: string): string {
    return path.join(getDotnetTemplateDir(context, version, projTemplateKey), 'item.nupkg');
}

export function getDotnetProjectTemplatePath(context: IActionContext, version: FuncVersion, projTemplateKey: string): string {
    return path.join(getDotnetTemplateDir(context, version, projTemplateKey), 'project.nupkg');
}

export function getDotnetTemplateDir(context: IActionContext, version: FuncVersion, projTemplateKey: string): string {
    const templateProvider = ext.templateProvider.get(context);
    return path.join(ext.context.globalStoragePath, templateProvider.templateSource || '', version, projTemplateKey);
}

export async function validateDotnetInstalled(context: IActionContext): Promise<void> {
    // NOTE: Doesn't feel obvious that `getFramework` would validate dotnet is installed, hence creating a separate function named `validateDotnetInstalled` to export from this file
    await getFramework(context, undefined);
}

let cachedFramework: string | undefined;
async function getFramework(context: IActionContext, workingDirectory: string | undefined): Promise<string> {
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

        // Use 3 before 5 because it's LTS
        const majorVersions: number[] = [3, 5, 2];

        let pickedVersion: number | undefined;

        // Try to get a GA version first (i.e. "1.0.0")
        for (const majorVersion of majorVersions) {
            const regExp: RegExp = new RegExp(`^\\s*${majorVersion}\\.[0-9]+\\.[0-9]+(\\s|$)`, 'm');
            if (regExp.test(versions)) {
                pickedVersion = majorVersion;
                break;
            }
        }

        // Otherwise allow a preview version (i.e. "1.0.0-alpha")
        if (!pickedVersion) {
            for (const majorVersion of majorVersions) {
                const regExp: RegExp = new RegExp(`^\\s*${majorVersion}\\.`, 'm');
                if (regExp.test(versions)) {
                    pickedVersion = majorVersion;
                    break;
                }
            }
        }


        if (!pickedVersion) {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(localize('noMatchingFramework', 'You must have the [.NET Core SDK](https://aka.ms/AA4ac70) installed to perform this operation. See [here](https://aka.ms/AA1tpij) for supported versions.'));
        } else {
            cachedFramework = `net${pickedVersion < 4 ? 'coreapp' : ''}${pickedVersion}.0`;
        }
    }

    return cachedFramework;
}
