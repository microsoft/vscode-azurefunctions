/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFunctionSetting } from './IFunctionSetting';

export enum TemplateCategory {
    Core = '$temp_category_core'
}

/**
 * Describes a template used for creating a function trigger (i.e. an HttpTrigger or TimerTrigger)
 */
export interface IFunctionTemplate {
    id: string;
    name: string;
    defaultFunctionName: string;
    language: string;
    isHttpTrigger: boolean;
    isTimerTrigger: boolean;
    userPromptedSettings: IFunctionSetting[];
    categories: TemplateCategory[];
}
