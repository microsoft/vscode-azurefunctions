/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration } from "vscode";
import { powershellDebugConfig } from "../../../debug/PowerShellDebugProvider";
import { ScriptInitVSCodeStep } from './ScriptInitVSCodeStep';

export class PowerShellInitVSCodeStep extends ScriptInitVSCodeStep {
    protected getDebugConfiguration(): DebugConfiguration {
        return powershellDebugConfig;
    }

    protected getRecommendedExtensions(): string[] {
        return ['ms-vscode.PowerShell'];
    }
}
