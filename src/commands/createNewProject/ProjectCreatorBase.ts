/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from "vscode-azureextensionui";
import { ProjectRuntime, TemplateFilter } from "../../constants";
import { tryGetLocalRuntimeVersion } from "../../funcCoreTools/tryGetLocalRuntimeVersion";
import { promptForProjectRuntime } from "../../ProjectSettings";

export abstract class ProjectCreatorBase {
    public deploySubpath: string = '';
    public preDeployTask: string = '';
    public excludedFiles: string | string[] = '';
    public otherSettings: { [key: string]: string } = {};
    public abstract templateFilter: TemplateFilter;
    public language: string;

    protected readonly functionAppPath: string;
    protected readonly actionContext: IActionContext;

    private _runtime: ProjectRuntime | undefined;

    constructor(functionAppPath: string, actionContext: IActionContext, runtime: ProjectRuntime | undefined, language: string) {
        this.functionAppPath = functionAppPath;
        this.actionContext = actionContext;
        this._runtime = runtime;
        this.language = language;
    }

    public async getRuntime(): Promise<ProjectRuntime> {
        if (this._runtime === undefined) {
            // tslint:disable-next-line: strict-boolean-expressions
            this._runtime = await tryGetLocalRuntimeVersion() || await promptForProjectRuntime();
        }

        return this._runtime;
    }

    public getLaunchJson(_runtime: ProjectRuntime): {} | undefined {
        // By default languages do not support attaching on F5. Each language that supports F5'ing will have to overwrite this method in the subclass
        return undefined;
    }

    /**
     * Generic place to put any language-specific code that applies to "Create New Project", but _not_ "Init Project For VS Code"
     */
    public abstract onCreateNewProject(): Promise<void>;

    /**
     * Generic place to put any language-specific code that applies to "Init Project For VS Code" (which is also a part of "Create New Project")
     */
    public abstract onInitProjectForVSCode(): Promise<void>;

    public abstract getTasksJson(runtime: ProjectRuntime): {};

    public getRecommendedExtensions(): string[] {
        return ['ms-azuretools.vscode-azurefunctions'];
    }

    protected setRuntime(value: ProjectRuntime): void {
        this._runtime = value;
    }
}
