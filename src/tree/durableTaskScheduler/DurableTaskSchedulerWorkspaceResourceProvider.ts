/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type WorkspaceResource, type WorkspaceResourceProvider } from "@microsoft/vscode-azureresources-api";
import { type Event, type ProviderResult } from "vscode";
import { DurableTaskSchedulerEmulatorsWorkspaceResource } from "./DurableTaskSchedulerEmulatorsWorkspaceResource";

export class DurableTaskSchedulerWorkspaceResourceProvider implements WorkspaceResourceProvider {
    onDidChangeResource?: Event<WorkspaceResource | undefined> | undefined;

    getResources(): ProviderResult<WorkspaceResource[]> {
        return [ new DurableTaskSchedulerEmulatorsWorkspaceResource() ];
    }
}
