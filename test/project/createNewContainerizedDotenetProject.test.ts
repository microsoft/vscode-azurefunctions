/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from "@microsoft/vscode-azext-dev";
import { FuncVersion, getRandomHexString } from "../../extension.bundle";
import { getRotatingAuthLevel } from "../nightly/getRotatingValue";
import { createAndValidateContainerizedProject } from "./createAndValidateProject";
import { getCSharpValidateOptions } from "./validateProject";

suite('Create New Dotnet Project', () => {
    test('checkDockerfileDotnetIsolated', async () => {
        const functionName: string = 'func' + getRandomHexString();
        const input = [/7.*isolated/i, /http\s*trigger/i, functionName, 'Company.Function', getRotatingAuthLevel()]
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateContainerizedProject(context, { ...getCSharpValidateOptions('net7.0', FuncVersion.v4), inputs: input })
        });
    });

    test('checkDockerfileDotnetLTS', async () => {
        const functionName: string = 'func' + getRandomHexString();
        const input = [/6/i, /http\s*trigger/i, functionName, 'Company.Function', getRotatingAuthLevel()]
        await runWithTestActionContext('createProject', async context => {
            await createAndValidateContainerizedProject(context, { ...getCSharpValidateOptions('net6.0', FuncVersion.v4), inputs: input })
        });
    });
});

