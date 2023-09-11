/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { DurableBackendValues } from "../../constants";
import { BindingSettingValue } from "../../funcConfig/function";
import { IBindingSetting } from "../../templates/IBindingTemplate";
import { FunctionTemplates } from "../../templates/IFunctionTemplate";
import { ParsedJob } from "../../templates/script/parseScriptTemplatesV2";
import { IProjectWizardContext } from "../createNewProject/IProjectWizardContext";

export interface IFunctionWizardContext extends Partial<ISubscriptionContext>, IProjectWizardContext {
    functionTemplate?: FunctionTemplates;
    functionName?: string;

    // Durable Functions
    hasDurableStorage?: boolean;
    newDurableStorageType?: DurableBackendValues;
}

export interface FunctionV2WizardContext extends IFunctionWizardContext {
    job?: ParsedJob;
    newFilePath?: string;
}


export function setBindingSetting(context: IFunctionWizardContext, setting: IBindingSetting, value: BindingSettingValue): void {
    context[setting.name.toLowerCase()] = value;
}

export function getBindingSetting(context: IFunctionWizardContext, setting: IBindingSetting): BindingSettingValue {
    const value = <BindingSettingValue>context[setting.name.toLowerCase()];
    return value === undefined && setting.required ? '' : value;
}
