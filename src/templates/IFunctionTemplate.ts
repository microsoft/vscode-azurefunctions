/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ProjectLanguage, type TemplateFilter } from '../constants';
import { type IBindingSetting } from './IBindingTemplate';
import { type TemplateSchemaVersion } from './TemplateProviderBase';
import { type ParsedJob, type RawTemplateV2 } from './script/parseScriptTemplatesV2';

export enum TemplateCategory {
    Core = '$temp_category_core'
}

/**
 * Describes a V1 template used for creating a function trigger (i.e. an HttpTrigger or TimerTrigger)
 */
export interface IFunctionTemplate extends FunctionTemplateBase {
    defaultFunctionName: string;
    isSqlBindingTemplate: boolean;
    userPromptedSettings: IBindingSetting[];
    categories: TemplateCategory[];
    categoryStyle?: string;
    isDynamicConcurrent: boolean;

    // a defined triggerType means that the template is part of Node V4 programming model
    triggerType?: string;
}

/**
 * Describes a V2 template used for creating a function trigger (i.e. an HttpTrigger or TimerTrigger)
 */
export interface FunctionV2Template extends RawTemplateV2, FunctionTemplateBase {
    // jobs translate to Azure Wizards
    wizards: ParsedJob[];
}

/**
 * Describes common properties between the V1 and V2 templates
 */
export interface FunctionTemplateBase {
    id: string;
    name: string;
    language: ProjectLanguage;
    isHttpTrigger: boolean;
    isTimerTrigger: boolean;
    isMcpTrigger: boolean;
    templateSchemaVersion: TemplateSchemaVersion
    templateFilter?: TemplateFilter; // defaults to All
}
