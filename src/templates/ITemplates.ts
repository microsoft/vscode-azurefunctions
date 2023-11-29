/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IBindingTemplate } from "./IBindingTemplate";
import { type FunctionTemplateBase } from "./IFunctionTemplate";

export interface ITemplates {
    functionTemplates: FunctionTemplateBase[];
    bindingTemplates: IBindingTemplate[];
}
