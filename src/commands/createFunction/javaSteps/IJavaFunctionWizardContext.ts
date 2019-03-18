/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFunctionWizardContext } from '../IFunctionWizardContext';

export interface IJavaFunctionWizardContext extends IFunctionWizardContext {
    packageName?: string;
}
