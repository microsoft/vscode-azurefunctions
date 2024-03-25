/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { type ExecuteActivityContext, type IAzureAgentInput, type ICreateChildImplContext } from '@microsoft/vscode-azext-utils';
import { type FuncVersion } from '../../FuncVersion';
import { type DurableBackendValues } from '../../constants';
import { type AppStackMajorVersion, type AppStackMinorVersion } from './stacks/models/AppStackModel';
import { type FunctionAppRuntimes, type FunctionAppStack } from './stacks/models/FunctionAppStackModel';

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
    newSiteStackFlex?: { runtime: string, version: string } /* While we're not using the stacks API for flex, it's easier to just hard-code these two values instead of the entire FullFunctionAppStack */

    durableStorageType?: DurableBackendValues;

    // Detected local connection string
    hasAzureStorageConnection?: boolean;
    hasEventHubsConnection?: boolean;
    hasSqlDbConnection?: boolean;

    ui: IAzureAgentInput;
}
