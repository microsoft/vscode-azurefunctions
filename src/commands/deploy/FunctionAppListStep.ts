/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site } from "@azure/arm-appservice";
import { parseAzureResourceGroupId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, nonNullProp, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { projectLanguageSetting } from "../../constants";
import { type ICreateFunctionAppContext } from "../../tree/SubscriptionTreeItem";
import { createWebSiteClient } from "../../utils/azureClients";
import { getWorkspaceSetting, getWorkspaceSettingFromAnyFolder } from "../../vsCodeConfig/settings";
import { type IFunctionAppWizardContext } from "../createFunctionApp/IFunctionAppWizardContext";
import { createCreateFunctionAppComponents } from "../createFunctionApp/createCreateFunctionAppComponents";
import { type IFuncDeployContext } from "./deploy";

export class FunctionAppListStep extends AzureWizardPromptStep<IFuncDeployContext> {
    public async prompt(context: IFuncDeployContext): Promise<void> {
        context.site = (await context.ui.showQuickPick(this.getPicks(context), { placeHolder: vscode.l10n.t("Select a function app") })).data;
    }

    public shouldPrompt(context: IFuncDeployContext): boolean {
        return !context.site;
    }

    private async getPicks(context: IFuncDeployContext): Promise<IAzureQuickPickItem<Site | undefined>[]> {
        const client = await createWebSiteClient(context);
        const sites = (await uiUtils.listAllIterator(client.webApps.list()));
        const qp = sites.filter(s => !!s.kind?.includes('functionapp')).map(fa => {
            return { label: nonNullProp(fa, 'name'), description: parseAzureResourceGroupId(fa.id).resourceGroup, data: fa }
        });

        qp.unshift({ label: '$(plus) Create new function app', description: '', data: undefined });

        return qp;
    }

    public async getSubWizard(context: IFuncDeployContext & Partial<IFunctionAppWizardContext> & Partial<ICreateFunctionAppContext>): Promise<AzureWizardPromptStep<IFuncDeployContext> | undefined> {
        if (!context.site) {
            const language: string | undefined = context.workspaceFolder ? getWorkspaceSetting(projectLanguageSetting, context.workspaceFolder) : getWorkspaceSettingFromAnyFolder(projectLanguageSetting);
            context.telemetry.properties.projectLanguage = language;

            const { promptSteps, executeSteps } = await createCreateFunctionAppComponents(context, context, language)
            return { promptSteps, executeSteps };
        }

        return;
    }
}
