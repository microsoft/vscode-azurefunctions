/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type FuncVersion } from "../../../FuncVersion";

export interface IPythonVenvWizardContext extends IActionContext {
    projectPath: string;
    version: FuncVersion;
    pythonAlias?: string;
    manuallyEnterAlias?: boolean;
    useExistingVenv?: boolean;
    venvName?: string;
    suppressSkipVenv?: boolean;

    // External runtime configuration from Azure APIs
    externalRuntimeConfig?: {
        runtimeName: string;
        runtimeVersion: string;
    };
}
