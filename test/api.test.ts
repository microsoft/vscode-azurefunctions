/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Extension, extensions } from "vscode";
import { runWithInputs } from 'vscode-azureextensiondev';
import { AzureExtensionApiProvider } from "vscode-azureextensionui/api";
import { nonNullValue, ProjectLanguage, registerOnActionStartHandler } from '../extension.bundle';
// eslint-disable-next-line no-restricted-imports
import { AzureFunctionsExtensionApi } from '../src/vscode-azurefunctions.api';
import { getTestWorkspaceFolder, testFolderPath } from './global.test';
import { getJavaScriptValidateOptions, IValidateProjectOptions, validateProject } from './project/validateProject';

suite(`AzureFunctionsExtensionApi`, () => {
    let api: AzureFunctionsExtensionApi;

    suiteSetup(() => {
        const extension: Extension<AzureExtensionApiProvider> | undefined = extensions.getExtension('ms-azuretools.vscode-azurefunctions');
        api = nonNullValue(extension).exports.getApi<AzureFunctionsExtensionApi>('^1.0.0');
    });

    test('createFunction in a subfolder of a workspace', async () => {
        const functionName: string = 'endpoint1';
        const language: string = ProjectLanguage.JavaScript;
        const workspaceFolder = getTestWorkspaceFolder();
        const projectSubpath = 'api';
        const folderPath: string = path.join(workspaceFolder, projectSubpath);

        await runWithInputs('api.createFunction', [language, functionName], registerOnActionStartHandler, async () => {
            await api.createFunction({
                folderPath,
                suppressCreateProjectPrompt: true,
                suppressOpenFolder: true,
                templateId: 'HttpTrigger',
                languageFilter: /Python|C\#|^(Java|Type)Script$/i,
                functionSettings: { authLevel: 'anonymous' },
                targetFramework: 'netcoreapp3.1' // Will only work on functions api v1.4.0, but won't hurt on v1.3.0
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

        await runWithInputs('api.createFunction', [language], registerOnActionStartHandler, async () => {
            await api.createFunction({
                folderPath,
                functionName,
                templateId: 'HttpTrigger',
                languageFilter: /^(Java|Type)Script$/i,
                functionSettings: { authLevel: 'anonymous' },
                suppressCreateProjectPrompt: true,
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
