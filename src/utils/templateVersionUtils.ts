/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLanguage } from "../constants";
import { IBindingTemplate } from "../templates/IBindingTemplate";
import { FunctionTemplateBase, FunctionV2Template, IFunctionTemplate } from "../templates/IFunctionTemplate";
import { TemplateSchemaVersion } from "../templates/TemplateProviderBase";
import { isPythonV2Plus } from "./programmingModelUtils";

export function getTemplateVersionFromLanguageAndModel(language?: ProjectLanguage, languageModel?: number): TemplateSchemaVersion {
    /* as of now, only Python V2 supports v2 templates */
    return isPythonV2Plus(language, languageModel) ? TemplateSchemaVersion.v2 : TemplateSchemaVersion.v1;
}

export function verifyTemplateIsV1(template?: FunctionTemplateBase | IBindingTemplate): template is IFunctionTemplate {
    return !!template && !('wizards' in template);
}

export function verifyTemplateIsV2(template?: FunctionTemplateBase | IBindingTemplate): template is FunctionV2Template {
    return !verifyTemplateIsV1(template);
}


export function assertTemplateIsV1(template?: FunctionTemplateBase | IBindingTemplate): asserts template is IFunctionTemplate {
    if (!verifyTemplateIsV1(template)) {
        throw new Error('Expected template to be v1');
    }
}

export function assertTemplateIsV2(template?: FunctionTemplateBase | IBindingTemplate): asserts template is FunctionV2Template {
    if (!verifyTemplateIsV2(template)) {
        throw new Error('Expected template to be v2');
    }
}

