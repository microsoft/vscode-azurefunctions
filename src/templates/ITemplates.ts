/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBindingTemplate } from "./IBindingTemplate";
import { IFunctionTemplate } from "./IFunctionTemplate";

export interface ITemplates {
    functionTemplates: IFunctionTemplate[];
    bindingTemplates?: IBindingTemplate[];
}
