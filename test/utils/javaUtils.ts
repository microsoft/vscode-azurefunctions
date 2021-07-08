/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { runWithTestActionContext, TestInput } from 'vscode-azureextensiondev';
import { createNewProjectInternal, ProjectLanguage } from '../../extension.bundle';
import { cleanTestWorkspace } from '../global.test';

export namespace javaUtils {
    export async function addJavaProjectToWorkspace(testWorkspacePath: string): Promise<void> {
        // Java templates require you to have a project open, so create one here
        if (!await fse.pathExists(path.join(testWorkspacePath, 'pom.xml'))) { // no need if the project is already created
            const inputs: (string | TestInput | RegExp)[] = [testWorkspacePath, ProjectLanguage.Java, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, 'javaAppName'];
            await cleanTestWorkspace();
            await runWithTestActionContext('createNewProject', async context => {
                await context.ui.runWithInputs(inputs, async () => {
                    await createNewProjectInternal(context, {});
                });
            });
        }
    }
}
