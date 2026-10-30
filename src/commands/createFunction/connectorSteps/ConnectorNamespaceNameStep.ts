/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullValueAndProp, validationUtils } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';
import { AzureConnectorNamespaceClient, type ConnectorNamespaceClient } from './ConnectorNamespaceClient';
import { type IConnectorNamespaceWizardContext } from './IConnectorNamespaceWizardContext';

export class ConnectorNamespaceNameStep<T extends IConnectorNamespaceWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _client: ConnectorNamespaceClient;

    public constructor(client: ConnectorNamespaceClient = new AzureConnectorNamespaceClient()) {
        super();
        this._client = client;
    }

    public async prompt(context: T): Promise<void> {
        const resourceGroupName = getResourceGroupName(context);
        context.newConnectorNamespaceName = (await context.ui.showInputBox({
            prompt: localize('connectorNamespaceNamePrompt', 'Enter a name for the new connector namespace.'),
            value: context.newConnectorNamespaceName,
            validateInput: validateConnectorNamespaceName,
            asyncValidationTask: async (name: string) => await this.validateNameAvailable(context, name),
        })).trim();
        context.connectorNamespaceNameResourceGroup = resourceGroupName;

        maskValue(context, context.newConnectorNamespaceName);
    }

    public shouldPrompt(context: T): boolean {
        return !context.newConnectorNamespaceName ||
            context.connectorNamespaceNameResourceGroup !== undefined &&
            context.connectorNamespaceNameResourceGroup !== getResourceGroupName(context);
    }

    private async validateNameAvailable(context: T, namespaceName: string = ''): Promise<string | undefined> {
        namespaceName = namespaceName.trim();
        maskValue(context, namespaceName);

        if (!await this._client.isNameAvailable(context, getResourceGroupName(context), namespaceName)) {
            return localize('connectorNamespaceAlreadyExists', 'A connector namespace with this name already exists in the selected resource group.');
        }

        return undefined;
    }
}

export function validateConnectorNamespaceName(namespaceName: string = ''): string | undefined {
    namespaceName = namespaceName.trim();

    const constraints: validationUtils.RangeConstraints = { lowerLimitIncl: 2, upperLimitIncl: 64 };
    if (!validationUtils.hasValidCharLength(namespaceName, constraints)) {
        return validationUtils.getInvalidCharLengthMessage(constraints);
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(namespaceName)) {
        return localize(
            'invalidConnectorNamespaceName',
            'A connector namespace name must start with an alphanumeric character and contain only alphanumeric characters, hyphens, or underscores.',
        );
    }

    return undefined;
}

function maskValue(context: IConnectorNamespaceWizardContext, value: string): void {
    if (value && !context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}

function getResourceGroupName(context: IConnectorNamespaceWizardContext): string {
    return context.newResourceGroupName ?? nonNullValueAndProp(context.resourceGroup, 'name');
}
