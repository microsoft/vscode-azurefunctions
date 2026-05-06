/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createWebSiteClient, type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { parseAzureResourceId, type ParsedAzureResourceId } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, createSubscriptionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type AzureSubscription } from '@microsoft/vscode-azureresources-api';
import { l10n } from 'vscode';
import { McpProjectType } from '../constants';
import { SubscriptionListStep } from './SubscriptionListStep';

export async function getMcpHostKey(context: IActionContext & { subscription?: AzureSubscription },
    args?: { resourceId?: string, projectType?: McpProjectType }): Promise<string> {
    const resourceId: string = args?.resourceId ?? await context.ui.showInputBox({
        prompt: l10n.t('Enter the resource ID of the Function App'),
        placeHolder: l10n.t('/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Web/sites/{functionAppName}'),
        validateInput: (value: string) => {
            if (!value) {
                return l10n.t('Resource ID cannot be empty.');
            }
            try {
                parseAzureResourceId(value);
            } catch {
                return l10n.t('Invalid resource ID format. Expected format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Web/sites/{functionAppName}');
            }
            return undefined;
        }
    });

    const projectType: McpProjectType = args?.projectType ?? (await context.ui.showQuickPick(
        [
            { label: l10n.t('MCP Extension Server'), data: McpProjectType.McpExtensionServer },
            { label: l10n.t('Self-Hosted MCP Server'), data: McpProjectType.SelfHostedMcpServer }
        ],
        { placeHolder: l10n.t('Select the MCP project type') }
    )).data;

    const parsedId: ParsedAzureResourceId = parseAzureResourceId(resourceId);
    const wizard = new AzureWizard<IActionContext & Partial<IAppServiceWizardContext>>(context, {
        promptSteps: [new SubscriptionListStep(parsedId.subscriptionId)],
        // this should never happen, but just in case
        title: l10n.t('Select the subscription that contains the function app {0}.', parsedId.resourceName)
    });

    await wizard.prompt();
    if (!context.subscription) {
        throw new Error(l10n.t('Subscription with id "{0}" not found.', parsedId.subscriptionId));
    }

    const subContext = createSubscriptionContext(context.subscription);
    const client = await createWebSiteClient([context, subContext]);
    const keys = await client.webApps.listHostKeys(parsedId.resourceGroup, parsedId.resourceName);

    if (projectType === McpProjectType.McpExtensionServer && keys.systemKeys?.['mcp_extension']) {
        return keys.systemKeys['mcp_extension'];
    }

    if (projectType === McpProjectType.SelfHostedMcpServer && keys.functionKeys?.['default']) {
        return keys.functionKeys['default'];
    }

    throw new Error(l10n.t('No appropriate host key found for MCP project type "{0}".', projectType));
}
