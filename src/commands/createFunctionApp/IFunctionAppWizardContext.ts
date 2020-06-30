/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAppServiceWizardContext, SiteClient } from 'vscode-azureappservice';
import { FuncVersion } from '../../FuncVersion';
import { IFunctionStackMajorVersion } from './functionStacks';

export interface IFunctionAppWizardContext extends IAppServiceWizardContext {
    version: FuncVersion;
    language: string | undefined;
    stackFilter?: string;
    newSiteStack?: INewSiteStacks;
    siteClient?: SiteClient;
}

export interface INewSiteStacks {
    name: string;
    displayVersion: string;
    windows?: INewSiteStack;
    linux?: INewSiteStack;
}

export interface INewSiteStack extends IFunctionStackMajorVersion {
    name: string;
}
