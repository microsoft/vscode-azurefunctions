/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { type IFunctionWizardContext } from '../IFunctionWizardContext';

export interface IBallerinaFunctionWizardContext extends IFunctionWizardContext {
    functionTemplate?: IBallerinaFunctionTemplate;
}

export interface IBallerinaFunctionTemplate extends IFunctionTemplate {
    templateFiles: { [filename: string]: string };
}
