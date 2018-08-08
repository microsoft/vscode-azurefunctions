/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, OutputChannel } from "vscode";
import { AzureTreeDataProvider, IAzureUserInput } from "vscode-azureextensionui";
import TelemetryReporter from "vscode-extension-telemetry";
import { FunctionTemplates } from "./templates/FunctionTemplates";

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let tree: AzureTreeDataProvider;
    export let outputChannel: OutputChannel;
    export let ui: IAzureUserInput;
    export let functionTemplates: FunctionTemplates;
    export let reporter: TelemetryReporter;
}
