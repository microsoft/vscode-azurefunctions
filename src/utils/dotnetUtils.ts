/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage } from '../constants';
import { FuncVersion } from '../FuncVersion';
import { localize } from "../localize";
import { cliFeedUtils } from './cliFeedUtils';

export namespace dotnetUtils {
    export const isolatedSdkName: string = 'Microsoft.Azure.Functions.Worker.Sdk';

    export function getDotnetDebugSubpath(targetFramework: string): string {
        return path.posix.join('bin', 'Debug', targetFramework);
    }

    /**
     * NOTE: 'extensions.csproj' is excluded as it has special meaning for the func cli
     */
    export async function getProjFiles(projectLanguage: ProjectLanguage, projectPath: string): Promise<string[]> {
        const regexp: RegExp = projectLanguage === ProjectLanguage.FSharp ? /\.fsproj$/i : /\.csproj$/i;
        const files: string[] = await fse.readdir(projectPath);
        return files.filter((f: string) => regexp.test(f) && !/^extensions\.csproj$/i.test(f));
    }

    export async function getTargetFramework(projFilePath: string): Promise<string> {
        return await getPropertyInProjFile(projFilePath, 'TargetFramework');
    }

    export async function tryGetFuncVersion(projFilePath: string): Promise<string | undefined> {
        try {
            return await getPropertyInProjFile(projFilePath, 'AzureFunctionsVersion');
        } catch {
            return undefined;
        }
    }

    export async function tryGetPlatformTarget(projFilePath: string): Promise<string | undefined> {
        try {
            return await getPropertyInProjFile(projFilePath, 'PlatformTarget');
        } catch {
            return undefined;
        }
    }

    async function getPropertyInProjFile(projFilePath: string, prop: string): Promise<string> {
        const projContents: string = (await fse.readFile(projFilePath)).toString();
        const regExp: RegExp = new RegExp(`<${prop}>(.*)<\\/${prop}>`);
        const matches: RegExpMatchArray | null = projContents.match(regExp);
        if (!matches) {
            throw new Error(localize('failedToFindProp', 'Failed to find "{0}" in project file "{1}".', prop, projFilePath));
        } else {
            return matches[1];
        }
    }

    export async function getTemplateKeyFromProjFile(projectPath: string | undefined, version: FuncVersion, language: ProjectLanguage): Promise<string> {
        let isIsolated: boolean = false;
        let targetFramework: string;
        switch (version) { // set up defaults
            case FuncVersion.v3:
                targetFramework = 'netcoreapp3.1';
                break;
            case FuncVersion.v2:
                targetFramework = 'netcoreapp2.1';
                break;
            case FuncVersion.v1:
                targetFramework = 'net461';
                break;
        }

        if (projectPath && await fse.pathExists(projectPath)) {
            const projFiles = await getProjFiles(language, projectPath);
            if (projFiles.length === 1) {
                const projFile = path.join(projectPath, projFiles[0]);
                targetFramework = await getTargetFramework(projFile);

                const projContents: string = (await fse.readFile(projFile)).toString();
                isIsolated = projContents.toLowerCase().includes(isolatedSdkName.toLowerCase());
            }
        }

        return getProjectTemplateKey(targetFramework, isIsolated);
    }

    export function getTemplateKeyFromFeedEntry(runtimeInfo: cliFeedUtils.IWorkerRuntime): string {
        const isIsolated = runtimeInfo.sdk.name.toLowerCase() === isolatedSdkName.toLowerCase();
        return getProjectTemplateKey(runtimeInfo.targetFramework, isIsolated);
    }

    function getProjectTemplateKey(targetFramework: string, isIsolated: boolean): string {
        // Remove any OS-specific stuff from target framework if present https://docs.microsoft.com/dotnet/standard/frameworks#net-5-os-specific-tfms
        let result = targetFramework.split('-')[0];
        if (isIsolated) {
            result += '-isolated';
        }
        return result;
    }
}
