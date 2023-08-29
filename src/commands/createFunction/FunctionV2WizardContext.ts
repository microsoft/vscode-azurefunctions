/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionV2Template } from '../../templates/FunctionV2Template';
import { ParsedJob } from "../../templates/script/parseScriptTemplatesV2";
import { IFunctionWizardContext } from './IFunctionWizardContext';

export interface FunctionV2WizardContext extends IFunctionWizardContext {
    functionV2Template?: FunctionV2Template;
    job?: ParsedJob;

    newFilePath?: string;

    // follow the format of `assignTo`: value
    // `assignTo` is the common ID between the inputs and the actions
    replaceTokens?: { [key: string]: string }[];
}
