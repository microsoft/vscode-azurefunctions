/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectRuntime } from "../../ProjectSettings";

export interface IProjectCreator {
    /**
     * Add all project files not included in the '.vscode' folder
     */
    addNonVSCodeFiles(functionAppPath: string): Promise<void>;
    getTasksJson(launchTaskId: string, funcProblemMatcher: {}): {};
    getLaunchJson(launchTaskId: string): {};
    getRuntime(): ProjectRuntime;
}
