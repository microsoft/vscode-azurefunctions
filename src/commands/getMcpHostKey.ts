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
    args: { resourceId: string, projectType: McpProjectType }): Promise<string> {
    const parsedId: ParsedAzureResourceId = parseAzureResourceId(args.resourceId);
    const wizard: AzureWizard<IAppServiceWizardContext> = new AzureWizard(context, {
        promptSteps: [new SubscriptionListStep(parsedId.subscriptionId)],
        // this should never happen, but just in case
        title: l10n.t('Select the subscription that contains the function app {0}.', parsedId.resourceName)
    });

    await wizard.prompt();
    if (!context.subscription) {
        throw new Error(l10n.t('Subscription with id "{0}" not found.', parsedId.subscriptionId));
    }

    const subContext = createSubscriptionContext(context.subscription)
    const client = await createWebSiteClient([context, subContext]);
    const keys = await client.webApps.listHostKeys(parsedId.resourceGroup, parsedId.resourceName);

    if (args.projectType === McpProjectType.McpExtensionServer && keys.systemKeys?.['mcp_extension']) {
        return keys.systemKeys['mcp_extension'];
    }

    if (args.projectType === McpProjectType.SelfHostedMcpServer && keys.functionKeys?.['default']) {
        return keys.functionKeys['default'];
    }

    throw new Error(l10n.t('No appropriate host key found for MCP project type "{0}".', args.projectType));
}
