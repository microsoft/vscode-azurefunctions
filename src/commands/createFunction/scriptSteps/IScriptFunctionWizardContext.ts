/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IScriptFunctionTemplate } from '../../../templates/parseScriptTemplates';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export interface IScriptFunctionWizardContext extends IFunctionWizardContext {
    functionTemplate?: IScriptFunctionTemplate;
}
