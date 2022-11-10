/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from "@microsoft/vscode-azext-utils";
import { DurableBackend, DurableBackendValues } from "../../../constants";
import { localize } from "../../../localize";
import { FunctionSubWizard } from "../FunctionSubWizard";
import { IFunctionWizardContext } from "../IFunctionWizardContext";
import { DurableSubWizard } from "./DurableSubWizard";

export class DurableStorageTypePromptStep<T extends IFunctionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _functionSettings: { [key: string]: string | undefined };

    public constructor(functionSettings?: { [key: string]: string | undefined }) {
        super();
        this._functionSettings = functionSettings || {};
    }

    public async prompt(context: T): Promise<void> {
        const durableStorageLabels: string[] = [
            'Durable Functions Orchestration using Storage',
            'Durable Functions Orchestration using Netherite',
            'Durable Functions Orchestration using SQL'
        ];

        const placeHolder: string = localize('chooseDurableStorageType', 'Choose a durable storage type.');
        const picks: IAzureQuickPickItem<DurableBackendValues>[] = [
            { label: durableStorageLabels[0], data: DurableBackend.Storage },
            { label: durableStorageLabels[1], data: DurableBackend.Netherite },
            { label: durableStorageLabels[2], data: DurableBackend.SQL }
        ];
        context.newDurableStorageType = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public shouldPrompt(context: T): boolean {
        return !context.hasDurableStorage && !context.newDurableStorageType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const durableSubWizard = await DurableSubWizard.createSubWizard(context);
        const functionSubWizard = await FunctionSubWizard.createSubWizard(context, this._functionSettings);

        if (durableSubWizard || functionSubWizard) {
            // Return the combined subWizards
            return {
                title: functionSubWizard?.title || durableSubWizard?.title,
                promptSteps: [...(durableSubWizard?.promptSteps ?? []), ...(functionSubWizard?.promptSteps ?? [])],
                executeSteps: [...(durableSubWizard?.executeSteps ?? []), ...(functionSubWizard?.executeSteps ?? [])]
            };
        } else {
            return undefined;
        }
    }
}
