/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration } from "vscode";
import { ProjectRuntime } from "../../../constants";
import { localize } from "../../../localize";
import { ScriptInitVSCodeStep } from './ScriptInitVSCodeStep';

export class DotnetScriptInitVSCodeStep extends ScriptInitVSCodeStep {
    protected getDebugConfiguration(runtime: ProjectRuntime): DebugConfiguration {
        return {
            name: localize('attachToNetFunc', "Attach to .NET Script Functions"),
            type: runtime === ProjectRuntime.v1 ? 'clr' : 'coreclr',
            request: 'attach',
            processId: '\${command:azureFunctions.pickProcess}'
        };
    }

    protected getRecommendedExtensions(): string[] {
        return ['ms-vscode.csharp'];
    }
}
