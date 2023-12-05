/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLanguage } from '../../../constants';
import { type IFunctionWizardContext } from '../IFunctionWizardContext';

export interface IDotnetFunctionWizardContext extends IFunctionWizardContext {
    namespace?: string;
}

export function getFileExtension(context: IDotnetFunctionWizardContext): string {
    return context.language === ProjectLanguage.FSharp ? '.fs' : '.cs';
}
