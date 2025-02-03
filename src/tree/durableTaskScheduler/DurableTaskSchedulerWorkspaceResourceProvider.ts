import { type WorkspaceResource, type WorkspaceResourceProvider } from "@microsoft/vscode-azureresources-api";
import { type Event, type ProviderResult } from "vscode";
import { DurableTaskSchedulerEmulatorsWorkspaceResource } from "./DurableTaskSchedulerEmulatorsWorkspaceResource";

export class DurableTaskSchedulerWorkspaceResourceProvider implements WorkspaceResourceProvider {
    onDidChangeResource?: Event<WorkspaceResource | undefined> | undefined;

    getResources(): ProviderResult<WorkspaceResource[]> {
        return [ new DurableTaskSchedulerEmulatorsWorkspaceResource() ];
    }
}
