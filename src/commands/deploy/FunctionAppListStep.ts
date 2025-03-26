/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site } from "@azure/arm-appservice";
import { parseAzureResourceGroupId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, createSubscriptionContext, nonNullProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { projectLanguageSetting } from "../../constants";
import { type ICreateFunctionAppContext } from "../../tree/SubscriptionTreeItem";
import { createWebSiteClient } from "../../utils/azureClients";
import { getWorkspaceSetting, getWorkspaceSettingFromAnyFolder } from "../../vsCodeConfig/settings";
import { createCreateFunctionAppComponents } from "../createFunctionApp/createCreateFunctionAppComponents";
import { type IFuncDeployContext } from "./deploy";

export class FunctionAppListStep extends AzureWizardPromptStep<IFuncDeployContext> {
    public async prompt(context: IFuncDeployContext): Promise<void> {
        context.site = (await context.ui.showQuickPick(this.getPicks(context), { placeHolder: vscode.l10n.t("Select a function app") })).data;
        context.telemetry.properties.resourceId = context.site?.id;
    }

    public shouldPrompt(context: IFuncDeployContext): boolean {
        return !context.site;
    }

    private async getPicks(context: IFuncDeployContext): Promise<IAzureQuickPickItem<Site | undefined>[]> {
        const client = await createWebSiteClient([context, createSubscriptionContext(nonNullProp(context, 'subscription'))]);
        const sites = (await uiUtils.listAllIterator(client.webApps.list()));
        const qp: IAzureQuickPickItem<Site | undefined>[] = sites.filter(s => !!s.kind?.includes('functionapp')).map(fa => {
            return {
                label: nonNullProp(fa, 'name'),
                description: parseAzureResourceGroupId(nonNullProp(fa, 'id')).resourceGroup,
                data: fa
            }
        });

        qp.unshift({ label: '$(plus) Create new function app...', data: undefined });
        return qp;
    }

    public async getSubWizard(context: IFuncDeployContext): Promise<IWizardOptions<IFuncDeployContext> | undefined> {
        if (context.site) {
            // if the user selected a function app, then we don't need to create a new one
            return undefined;
        }

        const language: string | undefined = context.workspaceFolder ? getWorkspaceSetting(projectLanguageSetting, context.workspaceFolder) : getWorkspaceSettingFromAnyFolder(projectLanguageSetting);
        context.telemetry.properties.projectLanguage = language;

        const { promptSteps, executeSteps } = await createCreateFunctionAppComponents(context as ICreateFunctionAppContext,
            createSubscriptionContext(nonNullProp(context, 'subscription')),
            language);
        return {
            // it's ugly, but we can cast because we know that this subwizard doesn't need to have the full IFuncDeployContext
            promptSteps: promptSteps as unknown as AzureWizardPromptStep<IFuncDeployContext>[],
            executeSteps: executeSteps as unknown as AzureWizardExecuteStep<IFuncDeployContext>[]
        };
    }

}
