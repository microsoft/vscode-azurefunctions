/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { localize } from "../../localize";
import { type CancellationTokenSource, Disposable, type Event, EventEmitter, type MessageItem } from "vscode";
import { type DurableTaskSchedulerResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerResourceModel";
import { type DurableTaskSchedulerDataBranchProvider } from "../../tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider";
import { type Activity, type ActivityTreeItemOptions, type OnErrorActivityData, type OnProgressActivityData } from "@microsoft/vscode-azext-utils/hostapi";
import { randomUUID } from "crypto";
import { withCancellation } from "../../utils/cancellation";
import { ext } from "../../extensionVariables";

export class AzureActivity extends Disposable implements Activity {
    private readonly onStartEmitter = new EventEmitter<ActivityTreeItemOptions>;
    private readonly onProgressEmitter = new EventEmitter<OnProgressActivityData>;
    private readonly onSuccessEmitter = new EventEmitter<ActivityTreeItemOptions>;
    private readonly onErrorEmitter = new EventEmitter<OnErrorActivityData>;

    private readonly uniqueId: string;

    constructor() {
        super(
            () => {
                this.onStartEmitter.dispose();
                this.onProgressEmitter.dispose();
                this.onSuccessEmitter.dispose();
                this.onErrorEmitter.dispose();
            });

            this.uniqueId = randomUUID();
        }

    get id(): string { return this.uniqueId; }

    cancellationTokenSource?: CancellationTokenSource | undefined;

    get onStart(): Event<ActivityTreeItemOptions> { return this.onStartEmitter.event; }

    get onProgress(): Event<OnProgressActivityData> { return this.onProgressEmitter.event; }

    get onSuccess(): Event<ActivityTreeItemOptions> { return this.onSuccessEmitter.event; }

    get onError(): Event<OnErrorActivityData> { return this.onErrorEmitter.event; }

    start(options: ActivityTreeItemOptions): void { this.onStartEmitter.fire(options); }

    progress(data: OnProgressActivityData): void { this.onProgressEmitter.fire(data); }

    succeed(options: ActivityTreeItemOptions): void { this.onSuccessEmitter.fire(options); }

    fail(data: OnErrorActivityData): void { this.onErrorEmitter.fire(data); }
}

export function deleteSchedulerCommandFactory(
    dataBranchProvider: DurableTaskSchedulerDataBranchProvider,
    schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, scheduler: DurableTaskSchedulerResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const deleteItem: MessageItem = {
            title: localize('deleteSchedulerLabel', 'Delete')
        };

        const result = await actionContext.ui.showWarningMessage(
            localize('deleteSchedulerConfirmationMessage', 'Are you sure you want to delete scheduler \'{0}\'?', scheduler.name),
            {
                modal: true
            },
            deleteItem
        );

        if (result !== deleteItem) {
            return;
        }

        const activity = new AzureActivity();

        await ext.rgApi.registerActivity(activity);

        const label = localize('deletingSchedulerActivityLabel', 'Delete Durable Task Scheduler \'{0}\'', scheduler.name);

        activity.start({
            label
        });

        try {
            const response = await schedulerClient.deleteScheduler(
                scheduler.subscription,
                scheduler.resourceGroup,
                scheduler.name
            );

            const result = await withCancellation(token => response.waitForCompletion(token), 1000 * 60 * 30);

            if (result === true) {
                activity.succeed({
                    label
                });
            }
            else {
                throw new Error(localize('deleteFailureMessage', 'The scheduler failed to delete within the allotted time.'));
            }
        }
        catch (error: unknown) {
            activity.fail({
                error,
                label
            });
        }
        finally {
            dataBranchProvider.refresh();

            activity.dispose();
        }
    }
}
