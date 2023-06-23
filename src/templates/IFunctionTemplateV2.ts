/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IParsedJob, IRawTemplateV2 } from "./script/parseScriptTemplatesV2";

export interface IFunctionTemplateV2 extends IRawTemplateV2 {
    id: string;
    // jobs translate to Azure Wizards
    wizards: IParsedJob[];
}
