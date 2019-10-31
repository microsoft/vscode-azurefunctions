/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAppServiceWizardContext } from 'vscode-azureappservice';
import { FuncVersion } from '../../FuncVersion';

export interface IFunctionAppWizardContext extends IAppServiceWizardContext {
    version: FuncVersion;
    language: string | undefined;
    runtimeFilter?: string;
}
