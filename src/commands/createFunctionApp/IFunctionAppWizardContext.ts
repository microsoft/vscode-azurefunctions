/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { ExecuteActivityContext, ICreateChildImplContext } from '@microsoft/vscode-azext-utils';
import { FuncVersion } from '../../FuncVersion';
import { AppStackMajorVersion, AppStackMinorVersion } from './stacks/models/AppStackModel';
import { FunctionAppRuntimes, FunctionAppStack } from './stacks/models/FunctionAppStackModel';

export type FullFunctionAppStack = {
    stack: FunctionAppStack;
    majorVersion: AppStackMajorVersion<FunctionAppRuntimes>;
    minorVersion: AppStackMinorVersion<FunctionAppRuntimes>;
};

export interface IFunctionAppWizardContext extends IAppServiceWizardContext, ICreateChildImplContext, ExecuteActivityContext {
    version: FuncVersion;
    language: string | undefined;
    stackFilter?: string;
    newSiteStack?: FullFunctionAppStack;
}
