/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConnectionTypeValues } from "../../../constants";

export interface IConnectionPromptOptions {
    preselectedConnectionType?: ConnectionTypeValues;
}

export interface IValidateConnectionOptions extends IConnectionPromptOptions {
    setConnectionForDeploy?: boolean;
}
