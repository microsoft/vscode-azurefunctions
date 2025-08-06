/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { type Uri } from "vscode";
import * as xml2js from "xml2js";
import { type IFunctionWizardContext } from "../commands/createFunction/IFunctionWizardContext";
import { DurableBackend, ProjectLanguage, hostFileName, requirementsFileName } from "../constants";
import { type IHostJsonV2 } from "../funcConfig/host";
import { dotnetUtils } from "./dotnetUtils";
import { hasNodeJsDependency } from "./nodeJsUtils";
import { pythonUtils } from "./pythonUtils";
import { findFiles } from "./workspace";

export namespace durableUtils {
    export const dotnetInProcDfSqlPackage: string = 'Microsoft.DurableTask.SqlServer.AzureFunctions';
    export const dotnetIsolatedDfSqlPackage: string = 'Microsoft.Azure.Functions.Worker.Extensions.DurableTask.SqlServer';
    export const dotnetInProcDfNetheritePackage: string = 'Microsoft.Azure.DurableTask.Netherite.AzureFunctions';
    export const dotnetIsolatedDfNetheritePackage: string = 'Microsoft.Azure.Functions.Worker.Extensions.DurableTask.Netherite';
    export const dotnetInProcDTSPackage: string = 'Microsoft.Azure.WebJobs.Extensions.DurableTask.AzureManaged';
    export const dotnetIsolatedDTSPackage: string = 'Microsoft.Azure.Functions.Worker.Extensions.DurableTask.AzureManaged';
    export const dotnetInProcDfBasePackage: string = 'Microsoft.Azure.WebJobs.Extensions.DurableTask';
    export const nodeDfPackage: string = 'durable-functions';
    export const pythonDfPackage: string = 'azure-functions-durable';

    export function requiresDurableStorageSetup(context: IFunctionWizardContext): boolean {
        return !!context.functionTemplate && templateRequiresDurableStorageSetup(context.functionTemplate.id, context.language) && !context.hasDurableStorage;
    }

    // Todo: https://github.com/microsoft/vscode-azurefunctions/issues/3529
    export function templateRequiresDurableStorageSetup(templateId: string, language?: string): boolean {
        // Todo: Remove when Powershell and Java implementation is added
        if (language === ProjectLanguage.PowerShell || language === ProjectLanguage.Java) {
            return false;
        }

        const durableEntity = /DurableFunctionsEntity/i;
        const durableOrchestrator: RegExp = /DurableFunctionsOrchestrat/i;  // Sometimes ends with 'or' or 'ion'

        return durableOrchestrator.test(templateId) || durableEntity.test(templateId);
    }

    export async function getStorageTypeFromWorkspace(language: string | undefined, projectPath: string): Promise<DurableBackend | undefined> {
        const hasDurableStorage: boolean = await verifyHasDurableStorage(language, projectPath);
        if (!hasDurableStorage) {
            return undefined;
        }

        const hostJsonPath = path.join(projectPath, hostFileName);
        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            return undefined;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath);
        const hostStorageType: DurableBackend | undefined = hostJson.extensions?.durableTask?.storageProvider?.type;

        switch (hostStorageType) {
            case DurableBackend.Netherite:
                return DurableBackend.Netherite;
            case DurableBackend.DTS:
                return DurableBackend.DTS;
            case DurableBackend.SQL:
                return DurableBackend.SQL;
            case DurableBackend.Storage:
            default:
                // New DF's will use the more specific type 'DurableBackend.Storage', but legacy implementations may return this value as 'undefined'
                return DurableBackend.Storage;
        }
    }

    // Use workspace dependencies as an indicator to check whether the project already has durable storage setup
    export async function verifyHasDurableStorage(language: string | undefined, projectPath: string): Promise<boolean> {
        switch (language) {
            case ProjectLanguage.Java:
                // ???
                return false;
            case ProjectLanguage.JavaScript:
            case ProjectLanguage.TypeScript:
                return await nodeProjectHasDurableDependency(projectPath);
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                return await dotnetProjectHasDurableDependency(projectPath);
            case ProjectLanguage.PowerShell:
                // ???
                return false;
            case ProjectLanguage.Python:
                return await pythonProjectHasDurableDependency(projectPath);
            default:
                return false;
        }
    }

    async function nodeProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        return await hasNodeJsDependency(projectPath, nodeDfPackage);
    }

    async function dotnetProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const csProjPaths: Uri[] = await findFiles(projectPath, '*.csproj');
        if (!(csProjPaths?.[0]?.path && await AzExtFsExtra.pathExists(csProjPaths[0].path))) {
            return false;
        }

        const csProjContents: string = await AzExtFsExtra.readFile(csProjPaths[0].path);

        return new Promise((resolve) => {
            xml2js.parseString(csProjContents, (err: Error, result: unknown): void => {
                if (result && !err) {
                    resolve(dotnetUtils.getPackageReferences(result).some(p => /Durable/i.test(p.Include)));
                }
            });
        });
    }

    async function pythonProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const requirementsPath: string = path.join(projectPath, requirementsFileName);
        return await pythonUtils.hasDependencyInRequirements(pythonDfPackage, requirementsPath);
    }
}
