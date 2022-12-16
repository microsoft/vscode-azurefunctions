/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions, openUrl } from "@microsoft/vscode-azext-utils";
import { DurableBackend, DurableBackendValues } from "../../../constants";
import { localize } from "../../../localize";
import { FunctionSubWizard } from "../FunctionSubWizard";
import { IFunctionWizardContext } from "../IFunctionWizardContext";

export class DurableStorageTypePromptStep<T extends IFunctionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _functionSettings: { [key: string]: string | undefined };

    public constructor(functionSettings?: { [key: string]: string | undefined }) {
        super();
        this._functionSettings = functionSettings || {};
    }

    public async prompt(context: T): Promise<void> {
        const durableStorageLabels: string[] = [
            'Azure Storage',
            'Netherite',
            'MSSQL'
        ];
        const durableStorageInfo: string = localize('durableStorageInfo', '$(link-external)  Learn more about the tradeoffs between storage providers');

        const placeHolder: string = localize('chooseDurableStorageType', 'Choose a durable storage type.');
        const picks: IAzureQuickPickItem<DurableBackendValues | undefined>[] = [
            { label: durableStorageLabels[0], description: localize('default', '(default)'), data: DurableBackend.Storage, suppressPersistence: true },
            { label: durableStorageLabels[1], data: DurableBackend.Netherite, suppressPersistence: true },
            { label: durableStorageLabels[2], data: DurableBackend.SQL, suppressPersistence: true },
            { label: durableStorageInfo, data: undefined, suppressPersistence: true }
        ];

        let pick: DurableBackendValues | undefined;
        while (!pick) {
            pick = (await context.ui.showQuickPick(picks, { placeHolder })).data;
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
