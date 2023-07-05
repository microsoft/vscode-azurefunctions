/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionTemplateV2 } from '../../templates/FunctionTemplateV2';
import { ParsedJob } from "../../templates/script/parseScriptTemplatesV2";
import { IFunctionWizardContext } from './IFunctionWizardContext';

export interface FunctionWizardV2Context extends IFunctionWizardContext {
    functionTemplateV2?: FunctionTemplateV2;
    job?: ParsedJob;

    // follow the format of `assignTo`: value
    // `assignTo` is the common ID between the inputs and the actions
    replaceTokens?: { [key: string]: string }[];
}
