/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { SemVer, coerce as semVerCoerce } from 'semver';
import { FuncVersion } from '../../FuncVersion';
import { ext } from "../../extensionVariables";
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

        // Prioritize "LTS", then "Current", then "Preview"
        const netVersions: string[] = ['6.0', '7.0', '5.0'];
        const semVersions: SemVer[] = netVersions.map(v => semVerCoerce(v) as SemVer);

        let pickedVersion: SemVer | undefined;

        // Try to get a GA version first (i.e. "1.0.0")
        for (const semVersion of semVersions) {
            const regExp: RegExp = new RegExp(`^\\s*${semVersion.major}\\.${semVersion.minor}\\.[0-9]+(\\s|$)`, 'm');
            if (regExp.test(versions)) {
                pickedVersion = semVersion;
                break;
            }
        }

        // Otherwise allow a preview version (i.e. "1.0.0-alpha")
        if (!pickedVersion) {
            for (const semVersion of semVersions) {
                const regExp: RegExp = new RegExp(`^\\s*${semVersion.major}\\.${semVersion.minor}\\.`, 'm');
                if (regExp.test(versions)) {
                    pickedVersion = semVersion;
                    break;
                }
            }
        }


        if (!pickedVersion) {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(localize('noMatchingFramework', 'You must have the [.NET Core SDK](https://aka.ms/AA4ac70) installed to perform this operation. See [here](https://aka.ms/AA1tpij) for supported versions.'));
        } else {
            cachedFramework = `${pickedVersion.major < 4 ? 'netcoreapp' : 'net'}${pickedVersion.major}.${pickedVersion.minor}`;
        }
    }

    return cachedFramework;
}
