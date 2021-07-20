/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from 'vscode-azureextensionui';
import { IParsedHostJson } from '../funcConfig/host';
import { FuncVersion } from '../FuncVersion';
import { ProjectSource } from './projectContextValues';

export type ApplicationSettings = { [propertyName: string]: string };

export interface IProjectTreeItem {
    source: ProjectSource;
    getHostUrl(context: IActionContext): Promise<string>;
    getHostJson(context: IActionContext): Promise<IParsedHostJson>;
    getVersion(): Promise<FuncVersion>;
    getApplicationSettings(context: IActionContext): Promise<ApplicationSettings>;
    setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void>;
}
