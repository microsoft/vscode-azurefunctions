/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedJob, RawTemplateV2 } from "./script/parseScriptTemplatesV2";

export interface FunctionTemplateV2 extends RawTemplateV2 {
    id: string;
    isHttpTrigger: boolean;
    isTimerTrigger: boolean;

    // jobs translate to Azure Wizards
    wizards: ParsedJob[];
}
