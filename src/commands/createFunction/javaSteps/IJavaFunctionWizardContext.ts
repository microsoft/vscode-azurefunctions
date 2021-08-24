/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export interface IJavaFunctionWizardContext extends IFunctionWizardContext {
    functionTemplate?: IJavaFunctionTemplate;
}

export interface IJavaFunctionTemplate extends IFunctionTemplate {
    templateFiles: { [filename: string]: string };
}
