import { type WorkspaceResource } from "@microsoft/vscode-azureresources-api";

export class DurableTaskSchedulerEmulatorsWorkspaceResource implements WorkspaceResource {
    resourceType: string = 'DurableTaskSchedulerEmulator';

    id: string = 'DurableTaskSchedulerEmulator';

    name: string = 'DurableTaskSchedulerEmulator';
}
