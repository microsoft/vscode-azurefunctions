/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext } from "vscode";
import { AzExtTreeDataProvider, IAzExtOutputChannel, IAzureUserInput, ITelemetryReporter } from "vscode-azureextensionui";
import { func } from "./constants";
import { IBindingTemplate } from "./templates/IBindingTemplate";
import { TemplateProvider } from "./templates/TemplateProvider";
import { AzureAccountTreeItemWithProjects } from "./tree/AzureAccountTreeItemWithProjects";

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let tree: AzExtTreeDataProvider;
    export let azureAccountTreeItem: AzureAccountTreeItemWithProjects;
    export let outputChannel: IAzExtOutputChannel;
    export let ui: IAzureUserInput;
    export let templateProviderTask: Promise<TemplateProvider>;
    export let reporter: ITelemetryReporter;
    export let funcCliPath: string = func;
    export let templateSource: TemplateSource | undefined;
    export let scriptBindings: IBindingTemplate[];
    // tslint:disable-next-line: strict-boolean-expressions
    export let ignoreBundle: boolean = !/^(false|0)?$/i.test(process.env.AZCODE_FUNCTIONS_IGNORE_BUNDLE || '');
}

export enum TemplateSource {
    Backup = 'Backup',
    CliFeed = 'CliFeed',
    StagingCliFeed = 'StagingCliFeed'
}
