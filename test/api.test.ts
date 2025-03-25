/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithInputs } from '@microsoft/vscode-azext-dev';
import { type apiUtils } from "@microsoft/vscode-azext-utils";
import * as path from 'path';
import { extensions, type Extension } from "vscode";
import { extensionId, FuncVersion, nonNullValue, ProjectLanguage, registerOnActionStartHandler } from '../extension.bundle';
// eslint-disable-next-line no-restricted-imports
import { type AzureFunctionsExtensionApi } from '../src/vscode-azurefunctions.api';
import { getTestWorkspaceFolder, testFolderPath } from './global.test';
import { getCSharpValidateOptions, getJavaScriptValidateOptions, validateProject, type IValidateProjectOptions } from './project/validateProject';

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

        await runWithInputs('api.createFunction', [language, functionName], registerOnActionStartHandler, async () => {
            await api.createFunction({
                folderPath,
                suppressOpenFolder: true,
                templateId: 'HttpTrigger',
                languageFilter: /Python|C\#|^(Java|Type)Script$/i,
                functionSettings: {
                    authLevel: 'anonymous',
                    'azureFunctions.projectLanguageModel': '4'
                },
                targetFramework: ['net6.0', 'net7.0', 'net8.0'] // Will only work on functions api v1.4.0, but won't hurt on v1.3.0
            });
        });

        const validateOptions: IValidateProjectOptions = getJavaScriptValidateOptions(true, undefined, projectSubpath, workspaceFolder);
        validateOptions.expectedPaths.push(
            path.join(projectSubpath, 'src', 'functions', `${functionName}.js`),
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
                functionSettings: {
                    authLevel: 'anonymous',
                    'azureFunctions.projectLanguageModel': '4'
                },
                suppressOpenFolder: true
            });
        });

        const validateOptions: IValidateProjectOptions = getJavaScriptValidateOptions(true);
        validateOptions.expectedPaths.push(
            path.join('src', 'functions', `${functionName}.js`)
        );
        await validateProject(folderPath, validateOptions);
    });

    test('createFunction dotnet with targetFramework', async () => {
        const functionName: string = 'endpoint1';
        const language: string = ProjectLanguage.CSharp;
        const workspaceFolder = getTestWorkspaceFolder();
        const projectSubpath = 'api';
        const folderPath: string = path.join(workspaceFolder, projectSubpath);

        await runWithInputs('api.createFunction', [language, /6/i, 'Company.Function', 'Anonymous'], registerOnActionStartHandler, async () => {
            await api.createFunction({
                folderPath,
                functionName,
                templateId: 'HttpTrigger',
                languageFilter: /^C\#$/i,
                functionSettings: {
                    authLevel: 'anonymous'
                },
                targetFramework: ['net8.0', 'net7.0', 'net6.0']
            });
        });

        const validateOptions: IValidateProjectOptions = getCSharpValidateOptions('net6.0', FuncVersion.v4, 1, projectSubpath, workspaceFolder);
        // Exclude .git because the test workspace folders are already inside a git repo so we don't do git init.
        validateOptions.excludedPaths?.push('.git');
        await validateProject(folderPath, validateOptions);
    });

    // Intentionally pass a version (8) that hasn't been specified in targetFramework (6 & 7) to verify it isn't a possible pick. In the correct case (when 8 isn't a pick) we throw an error. api.createFunction swallows the error and returns undefined.
    // In the incorrect case (when 8 is a pick) the test fails since the 2 provided test inputs have already been used, but there are more prompts.
    test('createFunction with language not in targetFramework', async () => {
        const functionName: string = 'endpoint1';
        const language: string = ProjectLanguage.CSharp;
        const workspaceFolder = getTestWorkspaceFolder();
        const projectSubpath = 'api';
        const folderPath: string = path.join(workspaceFolder, projectSubpath);

        await runWithInputs('api.createFunction', [language, /8/i], registerOnActionStartHandler, async () => {
            await api.createFunction({
                folderPath,
                functionName,
                templateId: 'HttpTrigger',
                languageFilter: /^C\#$/i,
                functionSettings: { authLevel: 'anonymous' },
                targetFramework: ['net7.0', 'net6.0']
            })
        });
    });
});
