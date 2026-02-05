/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { coerce as semVerCoerce, type SemVer } from 'semver';
import { type FuncVersion } from '../../FuncVersion';
import { ext, type IExtensionVariables } from "../../extensionVariables";
import { localize } from '../../localize';
import { cpUtils } from "../../utils/cpUtils";

export async function executeDotnetTemplateCommand(context: IActionContext,
    options: {
        version: FuncVersion,
        projTemplateKey: string,
        workingDirectory: string | undefined,
        operation: 'list' | 'create',
        overrideExtVariables?: IExtensionVariables
    },
    ...args: string[]): Promise<string> {

    const _ext = options.overrideExtVariables ?? ext;
    const jsonDllPath: string = _ext.context.asAbsolutePath(path.join('resources', 'dotnetJsonCli', 'Microsoft.TemplateEngine.JsonCli.dll'));
    return await cpUtils.executeCommand(
        undefined,
        options.workingDirectory,
        'dotnet',
        '--roll-forward',
        'Major',
        cpUtils.wrapArgInQuotes(jsonDllPath),
        '--templateDir',
        cpUtils.wrapArgInQuotes(getDotnetTemplateDir(context, options.version, options.projTemplateKey, options.overrideExtVariables)),
        '--operation',
        options.operation,
        ...args);
}

export function getDotnetItemTemplatePath(context: IActionContext, version: FuncVersion, projTemplateKey: string, overrideExtVariables?: IExtensionVariables): string {
    return path.join(getDotnetTemplateDir(context, version, projTemplateKey, overrideExtVariables), 'item.nupkg');
}

export function getDotnetProjectTemplatePath(context: IActionContext, version: FuncVersion, projTemplateKey: string, overrideExtVariables?: IExtensionVariables): string {
    return path.join(getDotnetTemplateDir(context, version, projTemplateKey, overrideExtVariables), 'project.nupkg');
}

export function getDotnetTemplateDir(context: IActionContext, version: FuncVersion, projTemplateKey: string, overrideExtVariables?: IExtensionVariables): string {
    const _ext = overrideExtVariables ?? ext;
    const templateProvider = _ext.templateProvider.get(context);
    return path.join(_ext.context.globalStoragePath, templateProvider.templateSource || '', version, projTemplateKey);
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
        const netVersions: string[] = ['6.0', '7.0', '8.0', '9.0', '10.0'];
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
