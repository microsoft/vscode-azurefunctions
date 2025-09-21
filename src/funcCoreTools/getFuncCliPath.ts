/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type WorkspaceFolder } from "vscode";
import { ext } from "../extensionVariables";
import { localize } from "../localize";
import { getWorkspaceSetting } from "../vsCodeConfig/settings";

const settingKey = 'funcCliPath';

export async function getFuncCliPath(context: IActionContext, projectPath: WorkspaceFolder | string | undefined): Promise<string> {
    const valueFromSetting = getWorkspaceSetting<string>(settingKey, projectPath);
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
