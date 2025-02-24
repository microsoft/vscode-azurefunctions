/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Activity, type ActivityTreeItemOptions, type OnErrorActivityData, type OnProgressActivityData } from "@microsoft/vscode-azext-utils/hostapi";
import { randomUUID } from "crypto";
import { type CancellationTokenSource, Disposable, type Event, EventEmitter } from "vscode";
import { ext } from "../extensionVariables";

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

export async function withAzureActivity(
    label: string,
    action: () => Promise<void>): Promise<void> {

    const activity = new AzureActivity();

    await ext.rgApi.registerActivity(activity);

    activity.start({
        label
    });

    try {
        await action();

        activity.succeed({
            label
        });
    }
    catch (error: unknown) {
        activity.fail({
            error,
            label
        });
    }
    finally {
        activity.dispose();
    }
}
