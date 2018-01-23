/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "../../localize";
import { extensionPrefix, ProjectRuntime, TemplateFilter } from "../../ProjectSettings";

export interface IProjectCreator {
    deploySubPath?: string;
    runtime: ProjectRuntime;
    templateFilter: TemplateFilter;

    /**
     * Add all project files not included in the '.vscode' folder
     */
    addNonVSCodeFiles(functionAppPath: string): Promise<void>;
    getTasksJson(): {};
    getLaunchJson?(): {};
    getRecommendedExtensions?(): string[];
}

export const funcHostTaskId: string = 'runFunctionsHost';
export const funcHostTaskLabel: string = localize('azFunc.runFuncHost', 'Run Functions Host');
export const funcHostProblemMatcher: {} = {
    owner: extensionPrefix,
    pattern: [
        {
            regexp: '\\b\\B',
            file: 1,
            location: 2,
            message: 3
        }
    ],
    background: {
        activeOnStart: true,
        beginsPattern: '^.*Stopping host.*',
        endsPattern: '^.*Job host started.*'
    }
};
