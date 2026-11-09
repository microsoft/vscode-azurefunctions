/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { initializeWorkflowTelemetry, type IActionContext, type WorkflowTelemetryOptions } from '@microsoft/vscode-azext-utils';
import { ProjectLanguage } from '../constants';

export namespace telemetryUtils {
    export function getProjectLanguage(language: string | undefined): ProjectLanguage | 'unknown' {
        return Object.values(ProjectLanguage).find(value => value === language) ?? 'unknown';
    }

    export const projectCreationStepNames: readonly string[] = [
        'projectCreationExperience', 'FolderListStep', 'NewProjectLanguageStep', 'ProgrammingModelStep',
        'DotnetRuntimeStep', 'projectConfiguration', 'FunctionListStep', 'FunctionNameStepBase',
        'PromptSchemaStepBase', 'ActionSchemaStepBase', 'ProjectCreateStepBase', 'FunctionCreateStepBase',
        'InitVSCodeStepBase', 'OpenBehaviorStep', 'OpenFolderStep', 'CreateDockerfileProjectStep',
        'targetNotEmpty', 'goNotInstalled',
    ];

    export const deploymentStepNames: readonly string[] = [
        'FunctionAppListStep', 'DeployFunctionCoreToolsStep', 'CreateRemoteMcpServerExecuteStep',
        'goNotInstalled', 'mismatch64bit', 'globSettingRemoved', 'incompatibleDotnetRuntime',
        'incompatibleVersion', 'validateRemoteBuild', 'multipleProjects',
    ];

    export function withWorkflowTelemetry<TArgs extends unknown[], TResult>(
        options: WorkflowTelemetryOptions,
        callback: (context: IActionContext, ...args: TArgs) => Promise<TResult>,
    ): (context: IActionContext, ...args: TArgs) => Promise<TResult> {
        return async (context, ...args) => {
            initializeWorkflowTelemetry(context, options);
            return await callback(context, ...args);
        };
    }

    export async function runWithDurationTelemetry<T>(context: IActionContext, prefix: string, callback: () => Promise<T>): Promise<T> {
        const start = Date.now();
        try {
            return await callback();
        } finally {
            const end = Date.now();
            const durationKey = prefix + 'Duration';
            const countKey = prefix + 'Count';
            const duration = (end - start) / 1000;

            context.telemetry.measurements[durationKey] = duration + (context.telemetry.measurements[durationKey] || 0);
            context.telemetry.measurements[countKey] = 1 + (context.telemetry.measurements[countKey] || 0);
        }
    }
}
