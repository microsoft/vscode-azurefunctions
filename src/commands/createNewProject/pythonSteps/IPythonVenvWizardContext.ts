/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from "vscode-azureextensionui";
import { FuncVersion } from "../../../FuncVersion";

export interface IPythonVenvWizardContext extends IActionContext {
    projectPath: string;
    version: FuncVersion;
    pythonAlias?: string;
    manuallyEnterAlias?: boolean;
    useExistingVenv?: boolean;
    venvName?: string;
    suppressSkipVenv?: boolean;
}
