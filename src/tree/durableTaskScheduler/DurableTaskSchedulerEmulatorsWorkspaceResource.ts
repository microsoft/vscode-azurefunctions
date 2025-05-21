/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type WorkspaceResource } from "@microsoft/vscode-azureresources-api";

export class DurableTaskSchedulerEmulatorsWorkspaceResource implements WorkspaceResource {
    resourceType: string = 'DurableTaskSchedulerEmulator';

    id: string = 'DurableTaskSchedulerEmulator';

    name: string = 'DurableTaskSchedulerEmulator';
}
