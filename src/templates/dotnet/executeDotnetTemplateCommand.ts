/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUtils, type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg, withNamedArg, withQuotedArg } from '@microsoft/vscode-processutils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { coerce as semVerCoerce, type SemVer } from 'semver';
import { type FuncVersion } from '../../FuncVersion';
import { ext } from "../../extensionVariables";
import { localize } from '../../localize';
import { cpUtils } from "../../utils/cpUtils";
import { findShortNameByIdentity, parseTemplatesFromNupkg } from './parseNupkgTemplates';

const itemNupkgFileName = 'item.nupkg';
const projectNupkgFileName = 'project.nupkg';

/**
 * Lists templates by parsing nupkg files directly (no longer uses the JsonCli DLL).
 */
export async function executeDotnetTemplateCommand(context: IActionContext, version: FuncVersion, projTemplateKey: string): Promise<string> {
    const templateDir = getDotnetTemplateDir(context, version, projTemplateKey);
    return await listDotnetTemplates(templateDir);
}

/**
 * Lists all templates from the item.nupkg and project.nupkg in the template directory
 * by parsing the `.template.config/template.json` files directly from the nupkg archives.
 */
async function listDotnetTemplates(templateDir: string): Promise<string> {
    const itemNupkg = path.join(templateDir, itemNupkgFileName);
    const projectNupkg = path.join(templateDir, projectNupkgFileName);

    const templates: object[] = [];

    for (const nupkgPath of [itemNupkg, projectNupkg]) {
        try {
            await fs.promises.access(nupkgPath);
            templates.push(...await parseTemplatesFromNupkg(nupkgPath));
        } catch {
            // nupkg doesn't exist, skip
        }
    }

    return JSON.stringify(templates);
}

/**
 * Creates a function or project from a .NET template using native `dotnet new` commands.
 * Uses an isolated DOTNET_CLI_HOME to avoid polluting the user's global template installation.
 */
export async function executeDotnetTemplateCreate(
    context: IActionContext,
    version: FuncVersion,
    projTemplateKey: string,
    workingDirectory: string | undefined,
    identity: string,
    templateArgs: Record<string, string>,
): Promise<void> {
    const templateDir = getDotnetTemplateDir(context, version, projTemplateKey);
    const itemNupkg = path.join(templateDir, itemNupkgFileName);
    const projectNupkg = path.join(templateDir, projectNupkgFileName);

    // Collect existing nupkg paths
    const nupkgPaths: string[] = [];
    for (const p of [itemNupkg, projectNupkg]) {
        try {
            await fs.promises.access(p);
            nupkgPaths.push(p);
        } catch {
            // doesn't exist, skip
        }
    }

    // Find the shortName for the given template identity
    const shortName = await findShortNameByIdentity(nupkgPaths, identity);

    // Use an isolated DOTNET_CLI_HOME so template installation doesn't affect the user's global state
    // This is how the JSON CLI tool operated
    const tempCliHome = path.join(os.tmpdir(), `azfunc-dotnet-home-${randomUtils.getRandomHexString()}`);
    const prevDotnetCliHome = process.env.DOTNET_CLI_HOME;

    try {
        process.env.DOTNET_CLI_HOME = tempCliHome;

        // Install template packages
        for (const nupkgPath of nupkgPaths) {
            await cpUtils.executeCommand(
                undefined,
                undefined,
                'dotnet',
                composeArgs(withArg('new', 'install'), withQuotedArg(nupkgPath))(),
            );
        }

        // Build dotnet new args: dotnet new <shortName> --<param> <value> ...
        const createArgs = composeArgs(
            withArg('new', shortName),
            ...Object.entries(templateArgs)
                // Filter out any arg whose value is nullish or an empty/stringified-nullish value.
                // Without this, values like `null` or the string "undefined" (e.g. `String(undefined)`)
                // would flow through to the CLI and produce errors like `'--FunctionsHttpPort'
                // cannot parse argument 'undefined'`.
                .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'undefined' && value !== 'null')
                .map(([key, value]) => withNamedArg(`--${key}`, value, { shouldQuote: true })),
        )();

        await cpUtils.executeCommand(
            undefined,
            workingDirectory,
            'dotnet',
            createArgs,
        );
    } finally {
        // Restore DOTNET_CLI_HOME
        if (prevDotnetCliHome !== undefined) {
            process.env.DOTNET_CLI_HOME = prevDotnetCliHome;
        } else {
            delete process.env.DOTNET_CLI_HOME;
        }

        // Clean up isolated home directory
        await fs.promises.rm(tempCliHome, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
    }
}

export function getDotnetItemTemplatePath(context: IActionContext, version: FuncVersion, projTemplateKey: string): string {
    return path.join(getDotnetTemplateDir(context, version, projTemplateKey), itemNupkgFileName);
}

export function getDotnetProjectTemplatePath(context: IActionContext, version: FuncVersion, projTemplateKey: string): string {
    return path.join(getDotnetTemplateDir(context, version, projTemplateKey), projectNupkgFileName);
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
            versions += await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', composeArgs(withArg('--version'))());
        } catch {
            // ignore
        }

        try {
            versions += await cpUtils.executeCommand(undefined, workingDirectory, 'dotnet', composeArgs(withArg('--list-sdks'))());
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
