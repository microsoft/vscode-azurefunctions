/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';

export enum FunctionLocation {
    MainScript,
    SelectedScript,
    Document
}

export interface IPythonFunctionWizardContext extends IScriptFunctionWizardContext {
    functionLocation?: FunctionLocation;
    functionScript?: string;
}
