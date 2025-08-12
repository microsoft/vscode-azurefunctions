/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { type ExecuteActivityContext, type IAzureAgentInput, type ICreateChildImplContext } from '@microsoft/vscode-azext-utils';
import { type DurableBackend } from '../../constants';
import { type FuncVersion } from '../../FuncVersion';
import { type ICreateFunctionAppContext } from '../../tree/SubscriptionTreeItem';
import { type AppStackMajorVersion, type AppStackMinorVersion } from './stacks/models/AppStackModel';
import { type Sku } from './stacks/models/FlexSkuModel';
import { type FunctionAppRuntimes, type FunctionAppStack } from './stacks/models/FunctionAppStackModel';

export type FullFunctionAppStack = {
    stack: FunctionAppStack;
    majorVersion: AppStackMajorVersion<FunctionAppRuntimes>;
    minorVersion: AppStackMinorVersion<FunctionAppRuntimes>;
};

export interface IFunctionAppWizardContext extends IAppServiceWizardContext, ICreateChildImplContext, ExecuteActivityContext, ICreateFunctionAppContext {
    version: FuncVersion;
    language: string | undefined;
    stackFilter?: string;
    newSiteStack?: FullFunctionAppStack;
    durableStorageType?: DurableBackend;
    useFlexConsumptionPlan?: boolean;
    useManagedIdentity?: boolean;
}

export interface IFlexFunctionAppWizardContext extends IFunctionAppWizardContext {
    newFlexSku?: Sku | null
    newFlexInstanceMemoryMB?: number;
    newFlexMaximumInstanceCount?: number;
}

export interface IFunctionAppAgentWizardContext extends IFunctionAppWizardContext {
    ui: IAzureAgentInput;
}
