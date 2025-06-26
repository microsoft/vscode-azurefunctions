/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, openUrl, type IAzureQuickPickItem, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { DurableBackend } from "../../../constants";
import { defaultDescription, previewDescription } from "../../../constants-nls";
import { localize } from "../../../localize";
import { FunctionSubWizard } from "../FunctionSubWizard";
import { type IFunctionWizardContext } from "../IFunctionWizardContext";

export class DurableStorageTypePromptStep<T extends IFunctionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _functionSettings: { [key: string]: string | undefined };

    public constructor(functionSettings?: { [key: string]: string | undefined }) {
        super();
        this._functionSettings = functionSettings || {};
    }

    public async prompt(context: T): Promise<void> {
        const durableStorageInfo: string = localize('durableStorageInfo', '$(link-external)  Learn more about the tradeoffs between storage providers');

        const placeHolder: string = localize('chooseDurableStorageType', 'Choose a durable storage type.');
        const picks: IAzureQuickPickItem<DurableBackend | undefined>[] = [
            { label: 'Azure Storage', description: defaultDescription, data: DurableBackend.Storage },
            { label: 'Durable Task Scheduler', description: previewDescription, data: DurableBackend.DTS },
            { label: 'MSSQL', data: DurableBackend.SQL },
            { label: durableStorageInfo, data: undefined }
        ];

        let pick: DurableBackend | undefined;
        while (!pick) {
            pick = (await context.ui.showQuickPick(picks, { placeHolder, suppressPersistence: true })).data;
            if (!pick) {
                await openUrl('https://aka.ms/durable-storage-providers');
            }
        }
        context.newDurableStorageType = pick;
    }

    public shouldPrompt(context: T): boolean {
        return !context.hasDurableStorage && !context.newDurableStorageType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        return await FunctionSubWizard.createSubWizard(context, this._functionSettings);
    }
}
