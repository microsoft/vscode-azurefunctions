/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DebugConfiguration } from "vscode";
import { FuncVersion } from "../../../FuncVersion";
import { localize } from "../../../localize";
import { ScriptInitVSCodeStep } from './ScriptInitVSCodeStep';

export class DotnetScriptInitVSCodeStep extends ScriptInitVSCodeStep {
    protected getDebugConfiguration(version: FuncVersion): DebugConfiguration {
        return {
            name: localize('attachToNetFunc', "Attach to .NET Script Functions"),
            type: version === FuncVersion.v1 ? 'clr' : 'coreclr',
            request: 'attach',
            processId: '\${command:azureFunctions.pickProcess}'
        };
    }

    protected getRecommendedExtensions(): string[] {
        return ['ms-dotnettools.csharp'];
    }
}
