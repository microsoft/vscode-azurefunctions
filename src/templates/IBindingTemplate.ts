/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFunctionSetting } from './IFunctionSetting';

/**
 * Describes a template used for creating a binding
 */
export interface IBindingTemplate {
    // tslint:disable-next-line: no-reserved-keywords
    type: string;
    direction: string;
    displayName: string;
    settings: IFunctionSetting[];
}
