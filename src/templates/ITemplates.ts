/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBindingTemplate } from "./IBindingTemplate";
import { FunctionV2Template, IFunctionTemplate } from "./IFunctionTemplate";

export interface ITemplates {
    functionTemplates: IFunctionTemplate[];
    functionTemplatesV2: FunctionV2Template[];
    bindingTemplates: IBindingTemplate[];
}
