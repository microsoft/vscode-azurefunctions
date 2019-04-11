/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFunctionBinding } from "../../FunctionConfig";
import { IBindingTemplate } from "../../templates/IBindingTemplate";
import { IFunctionWizardContext } from "../createFunction/IFunctionWizardContext";

export interface IBindingWizardContext extends IFunctionWizardContext {
    functionJsonPath: string;
    bindingDirection?: string;
    bindingTemplate?: IBindingTemplate;
    binding?: IFunctionBinding;
    bindingName?: string;
}
