/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, OutputChannel } from "vscode";
import { AzureTreeDataProvider, IAzureUserInput, ITelemetryReporter } from "vscode-azureextensionui";
import { IBindingTemplate } from "./templates/IBindingTemplate";
import { TemplateProvider } from "./templates/TemplateProvider";

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let tree: AzureTreeDataProvider;
    export let outputChannel: OutputChannel;
    export let ui: IAzureUserInput;
    export let templateProviderTask: Promise<TemplateProvider>;
    export let reporter: ITelemetryReporter;
    export let funcCliPath: string = 'func';
    export let templateSource: TemplateSource | undefined;
    export let scriptBindings: IBindingTemplate[];
}

export enum TemplateSource {
    Backup = 'Backup',
    CliFeed = 'CliFeed',
    StagingCliFeed = 'StagingCliFeed'
}
