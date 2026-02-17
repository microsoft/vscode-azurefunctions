/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ExecuteActivityContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type StorageProviderType } from "../../constants";
import { type BindingSettingValue } from "../../funcConfig/function";
import { type IBindingSetting } from "../../templates/IBindingTemplate";
import { type FunctionTemplateBase } from "../../templates/IFunctionTemplate";
import { type ParsedInput, type ParsedJob } from "../../templates/script/parseScriptTemplatesV2";
import { type IProjectWizardContext } from "../createNewProject/IProjectWizardContext";

export interface IFunctionWizardContext extends Partial<ISubscriptionContext>, IProjectWizardContext, ExecuteActivityContext {
    functionTemplate?: FunctionTemplateBase;
    functionName?: string;

    // Durable Functions
    hasDurableStorage?: boolean;
    newDurableStorageType?: StorageProviderType;

    useStorageEmulator?: boolean;
}

export interface FunctionV2WizardContext extends IFunctionWizardContext {
    job?: ParsedJob;
    newFilePath?: string;
}


export function setBindingSetting(context: IFunctionWizardContext, setting: IBindingSetting | ParsedInput, value: BindingSettingValue): void {
    context[setting.assignTo.toLowerCase()] = value;
}

export function getBindingSetting(context: IFunctionWizardContext, setting: IBindingSetting | ParsedInput): BindingSettingValue {
    const value = <BindingSettingValue>context[setting.assignTo.toLowerCase()];
    return value === undefined && setting.required ? '' : value;
}
