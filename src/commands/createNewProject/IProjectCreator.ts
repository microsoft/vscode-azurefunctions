/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputChannel } from "vscode";
import { TelemetryProperties } from "vscode-azureextensionui";
import { IUserInterface } from "../../IUserInterface";
import { localize } from "../../localize";
import { extensionPrefix, ProjectRuntime, promptForProjectRuntime, TemplateFilter } from "../../ProjectSettings";
import { functionRuntimeUtils } from "../../utils/functionRuntimeUtils";

export abstract class ProjectCreatorBase {
    public deploySubpath: string = '';
    public abstract templateFilter: TemplateFilter;

    protected readonly functionAppPath: string;
    protected readonly outputChannel: OutputChannel;
    protected readonly ui: IUserInterface;
    protected readonly telemetryProperties: TelemetryProperties;

    constructor(functionAppPath: string, outputChannel: OutputChannel, ui: IUserInterface, telemetryProperties: TelemetryProperties) {
        this.functionAppPath = functionAppPath;
        this.outputChannel = outputChannel;
        this.ui = ui;
        this.telemetryProperties = telemetryProperties;
    }

    public async getRuntime(): Promise<ProjectRuntime> {
        // tslint:disable-next-line:strict-boolean-expressions
        return await functionRuntimeUtils.tryGetLocalRuntimeVersion() || await promptForProjectRuntime(this.ui);
    }

    public getLaunchJson(): {} | undefined {
        // By default languages do not support attaching on F5. Each language that supports F5'ing will have to overwrite this method in the subclass
        return undefined;
    }

    /**
     * Add all project files not included in the '.vscode' folder
     */
    public abstract addNonVSCodeFiles(): Promise<void>;
    public abstract getTasksJson(): {};
    public getRecommendedExtensions(): string[] {
        return ['ms-azuretools.vscode-azurefunctions'];
    }
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
