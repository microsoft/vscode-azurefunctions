/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDeployContext } from "@microsoft/vscode-azext-azureappservice";

export interface IFunctionDeployContext extends IDeployContext {
    azureWebJobsConnectionForDeploy?: string;
    eventHubConnectionForDeploy?: string;
    sqlDbConnectionForDeploy?: string;
}
