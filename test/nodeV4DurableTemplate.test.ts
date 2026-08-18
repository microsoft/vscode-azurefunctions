/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { ProjectLanguage, TemplateFilter } from '../src/constants';
import { TemplateSource } from '../src/extensionVariables';
import { FuncVersion } from '../src/FuncVersion';
import { type FunctionTemplateBase } from '../src/templates/IFunctionTemplate';
import { type IScriptFunctionTemplate } from '../src/templates/script/parseScriptTemplates';
import { getTestWorkspaceFolder } from './global.test';
import { getCachedTestApi, getTestApi } from './utils/testApiAccess';

suite('Node v4 durable orchestrator template', () => {
    let testWorkspacePath: string;

    suiteSetup(async () => {
        await getTestApi();
        testWorkspacePath = getTestWorkspaceFolder();
    });

    for (const language of [ProjectLanguage.JavaScript, ProjectLanguage.TypeScript]) {
        test(`${language} starter starts generated orchestrator`, async () => {
            await runWithTestActionContext('getFunctionTemplates', async context => {
                const testApi = getCachedTestApi();
                const allTemplates: FunctionTemplateBase[] = await testApi.commands.getFunctionTemplates(
                    context,
                    testWorkspacePath,
                    language,
                    4,
                    FuncVersion.v4,
                    TemplateFilter.Verified,
                    undefined,
                    TemplateSource.Backup
                );

                const template = allTemplates.find(t => t.id === `DurableFunctionsOrchestrator-${language}-4.x`) as IScriptFunctionTemplate | undefined;
                assert.ok(template, `Missing durable orchestrator template for ${language}`);

                const templateContent = Object.values(template.templateFiles).join('\n');
                assert.ok(
                    templateContent.includes("startNew('%functionName%Orchestrator'"),
                    `Expected ${language} durable starter to call generated orchestrator name`
                );
                assert.ok(
                    !templateContent.includes('startNew(request.params.orchestratorName'),
                    `Expected ${language} durable starter to avoid route param orchestrator placeholder`
                );
                assert.ok(
                    !templateContent.includes('{orchestratorName}'),
                    `Expected ${language} durable starter route to avoid unresolved orchestrator placeholder`
                );
            });
        });
    }
});
