/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { TestActionContext, TestInput } from 'vscode-azureextensiondev';
import { createNewProjectInternal, getRandomHexString, hiddenStacksSetting, ProjectLanguage } from '../../extension.bundle';
import * as api from '../../src/vscode-azurefunctions.api';
import { testFolderPath } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { IValidateProjectOptions, validateProject } from './validateProject';

export interface ICreateProjectTestOptions extends IValidateProjectOptions {
    isHiddenLanguage?: boolean;
    inputs?: (string | TestInput | RegExp)[];
    projectPath?: string;
}

export async function createAndValidateProject(context: TestActionContext, options: ICreateProjectTestOptions): Promise<void> {
    // Clone inputs here so we have a different array each time
    const inputs: (string | TestInput | RegExp)[] = options.inputs ? [...options.inputs] : [];
    const language: ProjectLanguage = options.language;
    const projectPath: string = options.projectPath || path.join(testFolderPath, getRandomHexString(), language + 'Project');

    if (!options.isHiddenLanguage) {
        inputs.unshift(options.displayLanguage || language);
    }

    inputs.unshift(projectPath);
    inputs.unshift('$(file-directory) Browse...');

    // All languages except Java support creating a function after creating a project
    // Java needs to fix this issue first: https://github.com/Microsoft/vscode-azurefunctions/issues/81
    if (language !== ProjectLanguage.Java) {
        // don't create function
        inputs.push(/skip for now/i);
    }

    await runWithFuncSetting(hiddenStacksSetting, true, async () => {
        await context.ui.runWithInputs(inputs, async () => {
            await createNewProjectInternal(context, {
                language: options.isHiddenLanguage ? <api.ProjectLanguage>language : undefined,
                version: options.version,
                suppressOpenFolder: true
            });
        });
    });

    await validateProject(projectPath, options);
}
