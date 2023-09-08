/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBindingTemplate } from "../templates/IBindingTemplate";
import { FunctionTemplates, FunctionV2Template, IFunctionTemplate } from "../templates/IFunctionTemplate";

export function verifyTemplateIsV1(template?: FunctionTemplates | IBindingTemplate): template is IFunctionTemplate {
    return !!template && !('wizards' in template);
}

export function verifyTemplateIsV2(template?: FunctionTemplates | IBindingTemplate): template is FunctionV2Template {
    return !verifyTemplateIsV1(template);
}


export function assertTemplateIsV1(template?: FunctionTemplates | IBindingTemplate): asserts template is IFunctionTemplate {
    if (!verifyTemplateIsV1(template)) {
        throw new Error('Expected template to be v1');
    }
}

export function assertTemplateIsV2(template?: FunctionTemplates | IBindingTemplate): asserts template is FunctionV2Template {
    if (!verifyTemplateIsV2(template)) {
        throw new Error('Expected template to be v2');
    }
}

