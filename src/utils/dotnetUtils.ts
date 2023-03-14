/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage } from '../constants';
import { FuncVersion } from '../FuncVersion';
import { localize } from "../localize";
import { cliFeedUtils } from './cliFeedUtils';
import { telemetryUtils } from './telemetryUtils';
import { findFiles } from './workspace';

export namespace dotnetUtils {
    export const isolatedSdkName: string = 'Microsoft.Azure.Functions.Worker.Sdk';

    export class ProjectFile {
        public name: string;
        public fullPath: string;
        // We likely need to check a few things in quick succession, so we'll cache the contents here
        private _cachedContents: string | undefined;
        constructor(name: string, projectPath: string) {
            this.name = name;
            this.fullPath = path.join(projectPath, name);
        }

        public async getContents(): Promise<string> {
            if (this._cachedContents === undefined) {
                this._cachedContents = (await AzExtFsExtra.readFile(this.fullPath));
            }
            return this._cachedContents;
        }
    }

    export function getDotnetDebugSubpath(targetFramework: string): string {
        return path.posix.join('bin', 'Debug', targetFramework);
    }

    /**
     * NOTE: 'extensions.csproj' is excluded as it has special meaning for the func cli
     */
    export async function getProjFiles(context: IActionContext, projectLanguage: ProjectLanguage, projectPath: string): Promise<ProjectFile[]> {
        return await telemetryUtils.runWithDurationTelemetry(context, 'getNetProjFiles', async () => {
            const pattern = projectLanguage === ProjectLanguage.FSharp ? '*.fsproj' : '*.csproj';
            const uris = await findFiles(projectPath, pattern)
            return uris.map(uri => path.basename(uri.fsPath)).filter(f => f.toLowerCase() !== 'extensions.csproj').map(f => new ProjectFile(f, projectPath));
        });
    }

    export async function getTargetFramework(projFile: ProjectFile): Promise<string> {
        return await getPropertyInProjFile(projFile, 'TargetFramework');
    }

    export async function tryGetFuncVersion(projFile: ProjectFile): Promise<string | undefined> {
        try {
            return await getPropertyInProjFile(projFile, 'AzureFunctionsVersion');
        } catch {
            return undefined;
        }
    }

    export async function tryGetPlatformTarget(projFile: ProjectFile): Promise<string | undefined> {
        try {
            return await getPropertyInProjFile(projFile, 'PlatformTarget');
        } catch {
            return undefined;
        }
    }

    export async function getIsIsolated(projFile: ProjectFile): Promise<boolean> {
        try {
            return (await projFile.getContents()).toLowerCase().includes(isolatedSdkName.toLowerCase());
        } catch {
            return false;
        }
    }

    async function getPropertyInProjFile(projFile: ProjectFile, prop: string): Promise<string> {
        const regExp: RegExp = new RegExp(`<${prop}>(.*)<\\/${prop}>`);
        const matches: RegExpMatchArray | null = (await projFile.getContents()).match(regExp);
        if (!matches) {
            throw new Error(localize('failedToFindProp', 'Failed to find "{0}" in project file "{1}".', prop, projFile.name));
        } else {
            return matches[1];
        }
    }

    export async function getTemplateKeyFromProjFile(context: IActionContext, projectPath: string | undefined, version: FuncVersion, language: ProjectLanguage): Promise<string> {
        let isIsolated: boolean = false;
        let targetFramework: string;
        switch (version) { // set up defaults
            case FuncVersion.v4:
                targetFramework = 'net6.0';
                break;
            case FuncVersion.v3:
                targetFramework = 'netcoreapp3.1';
                break;
            case FuncVersion.v2:
                targetFramework = 'netcoreapp2.1';
                break;
            case FuncVersion.v1:
                targetFramework = 'net48';
                break;
        }

        if (projectPath && await AzExtFsExtra.pathExists(projectPath)) {
            const projFiles = await getProjFiles(context, language, projectPath);
            if (projFiles.length === 1) {
                targetFramework = await getTargetFramework(projFiles[0]);
                isIsolated = await getIsIsolated(projFiles[0]);
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

    interface CSProjXml {
        Project?: {
            ItemGroup?: {
                PackageReference?: {
                    '$': CSProjPackageReference;
                }[];
            }[];
        }
    }

    type CSProjPackageReference = {
        Include: string;
    }

    export function getPackageReferences(xml: CSProjXml): CSProjPackageReference[] {
        const packageReferences: CSProjPackageReference[] = [];
        // package references can be split across multiple item groups
        xml.Project?.ItemGroup?.forEach((itemGroup) => {
            const references = itemGroup.PackageReference;
            if (references) {
                references.forEach((reference) => {
                    packageReferences.push(reference.$);
                });
            }
        });
        return packageReferences;
    }
}
