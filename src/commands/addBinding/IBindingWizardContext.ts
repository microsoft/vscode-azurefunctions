/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ProjectLanguage } from "../../constants";
import { type IFunctionBinding } from "../../funcConfig/function";
import { type FuncVersion } from "../../FuncVersion";
import { type IBindingTemplate } from "../../templates/IBindingTemplate";
import { type IFunctionWizardContext } from "../createFunction/IFunctionWizardContext";

export interface IBindingWizardContext extends IFunctionWizardContext {
    functionJsonPath: string;
    language: ProjectLanguage;
    version: FuncVersion;
    bindingDirection?: string;
    bindingTemplate?: IBindingTemplate;
    binding?: IFunctionBinding;
    bindingName?: string;
}
