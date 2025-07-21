/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IStorageAccountWizardContext } from "@microsoft/vscode-azext-azureutils";
import { type StorageConnectionType } from "../IConnectionTypesContext";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IStorageConnectionWizardContext extends ISetConnectionSettingContext {
    azureWebJobsStorageType?: StorageConnectionType;

    // All properties from `IStorageSetSettingsContext` apply
}

export type IStorageAzureConnectionWizard = IStorageAccountWizardContext & IStorageConnectionWizardContext;
