/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, openUrl, type IAzureQuickPickItem, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { StorageProviderType } from "../../../constants";
import { defaultDescription, previewDescription } from "../../../constants-nls";
import { localize } from "../../../localize";
import { type IFunctionWizardContext } from "../IFunctionWizardContext";
import { DurableProjectConfigureStep } from "./DurableProjectConfigureStep";

export class DurableStorageTypeListStep<T extends IFunctionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const durableStorageInfo: string = localize('durableStorageInfo', '$(link-external)  Learn more about the tradeoffs between storage providers');

        const placeHolder: string = localize('chooseDurableStorageType', 'Choose a durable storage type.');
        const picks: IAzureQuickPickItem<StorageProviderType | undefined>[] = [
            { label: 'Azure Storage', description: defaultDescription, data: StorageProviderType.Storage },
            { label: 'Durable Task Scheduler', description: previewDescription, data: StorageProviderType.DTS },
            { label: 'MSSQL', data: StorageProviderType.SQL },
            { label: durableStorageInfo, data: undefined }
        ];

        let pick: StorageProviderType | undefined;
        while (!pick) {
            pick = (await context.ui.showQuickPick(picks, { placeHolder, suppressPersistence: true })).data;
            if (!pick) {
                await openUrl('https://aka.ms/durable-storage-providers');
            }
        }

        context.newDurableStorageType = pick;
        context.telemetry.properties.durableStorageType = pick;
    }

    public shouldPrompt(context: T): boolean {
        return !context.hasDurableStorage && !context.newDurableStorageType;
    }

    public async getSubWizard(): Promise<IWizardOptions<T> | undefined> {
        return { executeSteps: [new DurableProjectConfigureStep()] };
    }
}
