/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { TestInput } from 'vscode-azureextensiondev';
import { createNewProjectInternal, funcVersionSetting, getRandomHexString, ProjectLanguage } from '../../extension.bundle';
import * as api from '../../src/vscode-azurefunctions.api';
import { createTestActionContext, testFolderPath, testUserInput } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { IValidateProjectOptions, validateProject } from './validateProject';

export interface ICreateProjectTestOptions extends IValidateProjectOptions {
    isHiddenLanguage?: boolean;
    inputs?: (string | TestInput | RegExp)[];
    projectPath?: string;
}

export async function createAndValidateProject(options: ICreateProjectTestOptions): Promise<void> {
    // Clone inputs here so we have a different array each time
    const inputs: (string | TestInput | RegExp)[] = options.inputs ? [...options.inputs] : [];
    const language: ProjectLanguage = options.language;
    const projectPath: string = options.projectPath || path.join(testFolderPath, getRandomHexString(), language + 'Project');

    if (!options.isHiddenLanguage) {
        inputs.unshift(language);
    }

    inputs.unshift(projectPath);
    inputs.unshift('$(file-directory) Browse...');

    // All languages except Java support creating a function after creating a project
    // Java needs to fix this issue first: https://github.com/Microsoft/vscode-azurefunctions/issues/81
    if (language !== ProjectLanguage.Java) {
        // don't create function
        inputs.push(/skip for now/i);
    }

    await runWithFuncSetting(funcVersionSetting, options.version, async () => {
        await testUserInput.runWithInputs(inputs, async () => {
            await createNewProjectInternal(createTestActionContext(), {
                language: options.isHiddenLanguage ? <api.ProjectLanguage>language : undefined,
                suppressOpenFolder: true
            });
        });
    });

    await validateProject(projectPath, options);
}
