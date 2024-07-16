/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithInputs } from '@microsoft/vscode-azext-dev';
import { type apiUtils } from "@microsoft/vscode-azext-utils";
import * as path from 'path';
import { extensions, type Extension } from "vscode";
import { ProjectLanguage, extensionId, nonNullValue, registerOnActionStartHandler } from '../extension.bundle';
// eslint-disable-next-line no-restricted-imports
import { type AzureFunctionsExtensionApi } from '../src/vscode-azurefunctions.api';
import { getTestWorkspaceFolder, testFolderPath } from './global.test';
import { getJavaScriptValidateOptions, validateProject, type IValidateProjectOptions } from './project/validateProject';

suite(`AzureFunctionsExtensionApi`, () => {
    let api: AzureFunctionsExtensionApi;

    suiteSetup(() => {
        const extension: Extension<apiUtils.AzureExtensionApiProvider> | undefined = extensions.getExtension(extensionId);
        api = nonNullValue(extension).exports.getApi<AzureFunctionsExtensionApi>('^1.0.0');
    });

    test('createFunction in a subfolder of a workspace', async () => {
        const functionName: string = 'endpoint1';
        const language: string = ProjectLanguage.JavaScript;
        const workspaceFolder = getTestWorkspaceFolder();
        const projectSubpath = 'api';
        const folderPath: string = path.join(workspaceFolder, projectSubpath);

        await runWithInputs('api.createFunction', [language, /Model V3/, functionName], registerOnActionStartHandler, async () => {
            await api.createFunction({
                folderPath,
                suppressOpenFolder: true,
                templateId: 'HttpTrigger',
                languageFilter: /Python|C\#|^(Java|Type)Script$/i,
                functionSettings: { authLevel: 'anonymous' },
                targetFramework: ['netcoreapp3.1', 'net6.0', 'net8.0'] // Will only work on functions api v1.4.0, but won't hurt on v1.3.0
            });
        });

        const validateOptions: IValidateProjectOptions = getJavaScriptValidateOptions(true, undefined, projectSubpath, workspaceFolder);
        validateOptions.expectedPaths.push(
            path.join(projectSubpath, functionName, 'index.js'),
            path.join(projectSubpath, functionName, 'function.json'),
            path.join(projectSubpath, 'package.json')
        );
        // Exclude .git because the test workspace folders are already inside a git repo so we don't do git init.
        validateOptions.excludedPaths?.push('.git');
        await validateProject(folderPath, validateOptions);
    });

    test('createFunction', async () => {
        const functionName: string = 'endpoint1';
        const language: string = ProjectLanguage.JavaScript;
        const folderPath: string = path.join(testFolderPath, language + 'createFunctionApi2');

        await runWithInputs('api.createFunction', [language, /Model V3/], registerOnActionStartHandler, async () => {
            await api.createFunction({
                folderPath,
                functionName,
                templateId: 'HttpTrigger',
                languageFilter: /^(Java|Type)Script$/i,
                functionSettings: { authLevel: 'anonymous' },
                suppressOpenFolder: true
            });
        });

        const validateOptions: IValidateProjectOptions = getJavaScriptValidateOptions(true);
        validateOptions.expectedPaths.push(
            path.join(functionName, 'index.js'),
            path.join(functionName, 'function.json')
        );
        await validateProject(folderPath, validateOptions);
    });
});
