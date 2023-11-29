/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type FunctionEnvelope } from "@azure/arm-appservice";
import { AzExtFsExtra, callWithTelemetryAndErrorHandling, nonNullProp, type IActionContext } from "@microsoft/vscode-azext-utils";
import { functionJsonFileName } from "../constants";
import { ParsedFunctionJson } from "../funcConfig/function";
import { runningFuncTaskMap } from "../funcCoreTools/funcHostTask";
import { ProjectNotRunningError, getFunctionFolders } from "../tree/localProject/LocalFunctionsTreeItem";
import { isNodeV4Plus, isPythonV2Plus } from "../utils/programmingModelUtils";
import { requestUtils } from "../utils/requestUtils";
import { LocalFunction, type ILocalFunction } from "./LocalFunction";
import { type LocalProjectInternal } from "./listLocalProjects";
import path = require("path");

interface InvalidLocalFunction {
    error: unknown;
    name: string;
}

interface ListLocalFunctionsResult {
    functions: ILocalFunction[];
    invalidFunctions: InvalidLocalFunction[];
}

/**
 * @throws {ProjectNotRunningError} if a locally running project is required to list functions, but none was found
 */
export async function listLocalFunctions(project: LocalProjectInternal): Promise<ListLocalFunctionsResult> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await callWithTelemetryAndErrorHandling('listLocalFunctions', async (context) => {
        context.errorHandling.rethrow = true;
        context.errorHandling.suppressDisplay = true;
        const isFunctionalProgrammingModel = isPythonV2Plus(project.options.language, project.options.languageModel) || isNodeV4Plus(project.options);

        if (project.options.isIsolated || isFunctionalProgrammingModel) {
            return { functions: await getFunctionsForHostedProject(context, project), invalidFunctions: [] };
        } else {
            const result: ListLocalFunctionsResult = {
                functions: [],
                invalidFunctions: []
            }

            const functions: string[] = await getFunctionFolders(context, project.options.effectiveProjectPath);
            for (const func of functions) {
                try {
                    const functionJsonPath: string = path.join(project.options.effectiveProjectPath, func, functionJsonFileName);
                    const config: ParsedFunctionJson = new ParsedFunctionJson(await AzExtFsExtra.readJSON(functionJsonPath));
                    result.functions.push(new LocalFunction(project, func, config));
                } catch (error: unknown) {
                    result.invalidFunctions.push({
                        name: func,
                        error,
                    });
                }
            }

            return result;
        }
    }))!;
}

/**
 * Some projects (e.g. .NET Isolated and PyStein (i.e. Python model >=2)) don't have typical "function.json" files, so we'll have to ping localhost to get functions (only available if the project is running)
*/
async function getFunctionsForHostedProject(context: IActionContext, project: LocalProjectInternal): Promise<ILocalFunction[]> {
    if (runningFuncTaskMap.has(project.options.folder)) {
        const hostRequest = await project.getHostRequest(context);
        const functions = await requestUtils.sendRequestWithExtTimeout(context, {
            url: `${hostRequest.url}/admin/functions`,
            method: 'GET',
            rejectUnauthorized: hostRequest.rejectUnauthorized
        });

        return (<FunctionEnvelope[]>functions.parsedBody).map(func => {
            func = requestUtils.convertToAzureSdkObject(func);
            return new LocalFunction(project, nonNullProp(func, 'name'), new ParsedFunctionJson(func.config), func)
        });
    } else {
        throw new ProjectNotRunningError();
    }

    return [];
}
