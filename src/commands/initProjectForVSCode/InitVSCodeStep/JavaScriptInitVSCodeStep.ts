/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration } from "vscode";
import { nodeDebugConfig } from "../../../debug/NodeDebugProvider";
import { ScriptInitVSCodeStep } from './ScriptInitVSCodeStep';

export class JavaScriptInitVSCodeStep extends ScriptInitVSCodeStep {
    protected getDebugConfiguration(): DebugConfiguration {
        return nodeDebugConfig;
    }
}
