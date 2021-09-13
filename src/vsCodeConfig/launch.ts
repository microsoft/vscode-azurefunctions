/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration, workspace, WorkspaceConfiguration, WorkspaceFolder } from "vscode";

const configurationsKey: string = 'configurations';
const launchKey: string = 'launch';
const versionKey: string = 'version';
export const launchVersion: string = '0.2.0';

export function getDebugConfigs(folder: WorkspaceFolder): DebugConfiguration[] {
    return getLaunchConfig(folder).get<DebugConfiguration[]>(configurationsKey) || [];
}

export async function updateDebugConfigs(folder: WorkspaceFolder, configs: DebugConfiguration[]): Promise<void> {
    await getLaunchConfig(folder).update(configurationsKey, configs);
}

export function getLaunchVersion(folder: WorkspaceFolder): string | undefined {
    return getLaunchConfig(folder).get<string>(versionKey);
}

export async function updateLaunchVersion(folder: WorkspaceFolder, version: string): Promise<void> {
    await getLaunchConfig(folder).update(versionKey, version);
}

export function isDebugConfigEqual(c1: DebugConfiguration, c2: DebugConfiguration): boolean {
    return c1.name === c2.name && c1.request === c2.request && isTypeEqual(c1.type, c2.type);
}

function isTypeEqual(type1: string, type2: string): boolean {
    return type1 === type2 || (isNodeType(type1) && isNodeType(type2));
}

/**
 * Special case node debug type because it can be either "node", "node2", or "pwa-node"
 * https://github.com/microsoft/vscode-azurefunctions/issues/1259
 */
function isNodeType(t: string): boolean {
    return /node/i.test(t);
}

function getLaunchConfig(folder: WorkspaceFolder): WorkspaceConfiguration {
    return workspace.getConfiguration(launchKey, folder.uri);
}

export interface ILaunchJson {
    version: string;
    configurations?: DebugConfiguration[];
}
