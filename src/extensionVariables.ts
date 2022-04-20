/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzExtOutputChannel, IExperimentationServiceAdapter } from "@microsoft/vscode-azext-utils";
import { AzureHostExtensionApi } from "@microsoft/vscode-azext-utils/hostapi";
import { ExtensionContext } from "vscode";
import { func } from "./constants";
import { CentralTemplateProvider } from "./templates/CentralTemplateProvider";
import { AzureAccountTreeItemWithProjects } from "./tree/AzureAccountTreeItemWithProjects";

/**
 * Used for extensionVariables that can also be set per-action
 */
class ActionVariable<T> {
    private _extensionVariable: T | undefined;
    private _key: string;

    public constructor(key: string) {
        this._key = key;
    }

    public registerActionVariable(value: T, context: IActionContext): void {
        context[this._key] = value;
    }

    public registerExtensionVariable(value: T): void {
        this._extensionVariable = value;
    }

    public get(context: IActionContext): T {
        if (context[this._key] !== undefined) {
            return <T>context[this._key];
        } else if (this._extensionVariable !== undefined) {
            return <T>this._extensionVariable;
        } else {
            throw new Error(`Internal Error: "${this._key}" must be registered before use.`);
        }
    }
}

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let azureAccountTreeItem: AzureAccountTreeItemWithProjects;
    export let outputChannel: IAzExtOutputChannel;
    // eslint-disable-next-line prefer-const
    export let defaultFuncCliPath: string = func;
    export let ignoreBundle: boolean | undefined;
    export const prefix: string = 'azureFunctions';
    export let experimentationService: IExperimentationServiceAdapter;
    export const templateProvider = new ActionVariable<CentralTemplateProvider>('_centralTemplateProvider');
    export let rgApi: AzureHostExtensionApi;
}

export enum TemplateSource {
    Backup = 'Backup',
    Latest = 'Latest',
    Staging = 'Staging'
}
