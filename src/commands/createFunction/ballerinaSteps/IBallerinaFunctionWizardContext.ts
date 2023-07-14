/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export interface IBallerinaFunctionWizardContext extends IFunctionWizardContext {
    functionTemplate?: IBallerinaFunctionTemplate;
}

export interface IBallerinaFunctionTemplate extends IFunctionTemplate {
    templateFiles: { [filename: string]: string };
}
