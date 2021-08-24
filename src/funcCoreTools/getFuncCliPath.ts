/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolder } from "vscode";
import { IActionContext } from "vscode-azureextensionui";
import { ext } from "../extensionVariables";
import { localize } from "../localize";
import { getWorkspaceSetting } from "../vsCodeConfig/settings";

const settingKey = 'funcCliPath';

export async function getFuncCliPath(context: IActionContext, workspacePath: WorkspaceFolder | string | undefined): Promise<string> {
    const valueFromSetting = getWorkspaceSetting<string>(settingKey, workspacePath);
    if (valueFromSetting) {
        context.telemetry.properties.funcCliSource = 'setting';
        return valueFromSetting;
    } else {
        return ext.defaultFuncCliPath;
    }
}

export function validateNoFuncCliSetting(): void {
    if (hasFuncCliSetting()) {
        throw new Error(localize('notSupportedWithSetting', 'This operation is not supported when "{0}.{1}" is set.', ext.prefix, settingKey));
    }
}

export function hasFuncCliSetting(): boolean {
    return !!getWorkspaceSetting<string>(settingKey);
}
