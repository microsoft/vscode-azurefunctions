/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLanguage } from '../../../constants';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export interface IDotnetFunctionWizardContext extends IFunctionWizardContext {
    namespace?: string;
}

export function getFileExtension(wizardContext: IDotnetFunctionWizardContext): string {
    return wizardContext.language === ProjectLanguage.FSharp ? '.fs' : '.cs';
}
