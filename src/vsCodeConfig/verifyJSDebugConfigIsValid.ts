/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { ProjectLanguage, tasksFileName, vscodeFolderName } from '../constants';
import { oldFuncHostNameRegEx } from "../funcCoreTools/funcHostTask";
import { tryGetLocalFuncVersion } from '../funcCoreTools/tryGetLocalFuncVersion';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { parseJson } from '../utils/parseJson';
import { promptToReinitializeProject } from './promptToReinitializeProject';
import { ITask, ITasksJson } from './tasks';

/**
 * JavaScript debugging in the func cli had breaking changes in v2.0.1-beta.30 (~6/2018). This verifies users are up-to-date with the latest working debug config.
 * See https://aka.ms/AA1vrxa for more info
 */
export async function verifyJSDebugConfigIsValid(projectLanguage: ProjectLanguage | undefined, workspacePath: string, context: IActionContext): Promise<void> {
    const version: FuncVersion | undefined = await tryGetLocalFuncVersion();
    if (version === FuncVersion.v2) { // no need to check v1 or v3+
        const tasksJsonPath: string = path.join(workspacePath, vscodeFolderName, tasksFileName);
        const rawTasksData: string = (await fse.readFile(tasksJsonPath)).toString();

        const funcNodeDebugEnvVar: string = 'languageWorkers__node__arguments';
        const oldFuncNodeDebugEnvVar: string = funcNodeDebugEnvVar.replace(/__/g, ':'); // Also check against an old version of the env var that works in most (but not all) cases
        if (!rawTasksData.includes(funcNodeDebugEnvVar) && !rawTasksData.includes(oldFuncNodeDebugEnvVar)) {
            const tasksContent: ITasksJson = parseJson(rawTasksData);

            // NOTE: Only checking against oldFuncHostNameRegEx (where label looks like "runFunctionsHost")
            // If they're using the tasks our extension provides (where label looks like "func: host start"), they are already good-to-go
            const funcTask: ITask | undefined = tasksContent.tasks && tasksContent.tasks.find((t: ITask) => !!t.label && oldFuncHostNameRegEx.test(t.label));
            if (funcTask) {
                context.telemetry.properties.verifyConfigPrompt = 'updateJSDebugConfig';

                const settingKey: string = 'showDebugConfigWarning';
                const message: string = localize('uninitializedWarning', 'Your debug configuration is out of date and may not work with the latest version of the Azure Functions Core Tools.');
                const learnMoreLink: string = 'https://aka.ms/AA1vrxa';
                if (await promptToReinitializeProject(workspacePath, settingKey, message, learnMoreLink, context)) {
                    context.errorHandling.suppressDisplay = false;
                    await initProjectForVSCode(context, workspacePath, projectLanguage);
                }
            }
        }
    }
}
