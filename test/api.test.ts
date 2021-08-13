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
import { testFolderPath } from './global.test';
import { getJavaScriptValidateOptions, IValidateProjectOptions, validateProject } from './project/validateProject';

suite(`AzureFunctionsExtensionApi`, () => {
    let api: AzureFunctionsExtensionApi;

    suiteSetup(() => {
        const extension: Extension<AzureExtensionApiProvider> | undefined = extensions.getExtension('ms-azuretools.vscode-azurefunctions');
        api = nonNullValue(extension).exports.getApi<AzureFunctionsExtensionApi>('^1.0.0');
    });

    test('createFunction', async () => {
        const functionName: string = 'endpoint1';
        const language: string = ProjectLanguage.JavaScript;
        const folderPath: string = path.join(testFolderPath, language + 'createFunctionApi');

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
