/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectRuntime } from '../constants';
import { IParsedHostJson } from '../funcConfig/host';
import { ProjectSource } from './projectContextValues';

export type ApplicationSettings = { [propertyName: string]: string };

export interface IProjectTreeItem {
    source: ProjectSource;
    hostUrl: string;
    getHostJson(): Promise<IParsedHostJson>;
    getRuntime(): Promise<ProjectRuntime>;
    getApplicationSettings(): Promise<ApplicationSettings>;
}
