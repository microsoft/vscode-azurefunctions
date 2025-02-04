import { type WorkspaceResource, type WorkspaceResourceBranchDataProvider } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, type Event, type TreeItem, Disposable, EventEmitter } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { DurableTaskSchedulerEmulatorsWorkspaceResourceModel } from "./DurableTaskSchedulerEmulatorsWorkspaceResourceModel";
import { type DurableTaskSchedulerEmulatorClient } from "./DurableTaskSchedulerEmulatorClient";

export class DurableTaskSchedulerWorkspaceDataBranchProvider extends Disposable implements WorkspaceResourceBranchDataProvider<DurableTaskSchedulerWorkspaceResourceModel> {
    private readonly onDidChangeTreeDataEmitter = new EventEmitter<void | DurableTaskSchedulerWorkspaceResourceModel | DurableTaskSchedulerWorkspaceResourceModel[] | null | undefined>;
    private readonly onEmulatorsChangedSubscription: Disposable;

    constructor(private readonly emulatorClient: DurableTaskSchedulerEmulatorClient) {
        super(
            () => {
                this.onEmulatorsChangedSubscription.dispose();
                this.onDidChangeTreeDataEmitter.dispose();
            });

        this.onEmulatorsChangedSubscription = this.emulatorClient.onEmulatorsChanged(
            () => {
                this.onDidChangeTreeDataEmitter.fire();
            });
    }

    getChildren(element: DurableTaskSchedulerWorkspaceResourceModel): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]> {
        return element.getChildren();
    }

    getResourceItem(_: WorkspaceResource): DurableTaskSchedulerWorkspaceResourceModel | Thenable<DurableTaskSchedulerWorkspaceResourceModel> {
        return new DurableTaskSchedulerEmulatorsWorkspaceResourceModel(this.emulatorClient);
    }

    get onDidChangeTreeData(): Event<void | DurableTaskSchedulerWorkspaceResourceModel | DurableTaskSchedulerWorkspaceResourceModel[] | null | undefined> { return this.onDidChangeTreeDataEmitter.event; }

    getTreeItem(element: DurableTaskSchedulerWorkspaceResourceModel): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }
}
