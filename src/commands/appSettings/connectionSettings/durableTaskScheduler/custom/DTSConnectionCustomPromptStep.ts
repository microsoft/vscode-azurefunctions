/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, validationUtils } from '@microsoft/vscode-azext-utils';
import { ConnectionType } from '../../../../../constants';
import { localize } from '../../../../../localize';
import { type IDTSConnectionWizardContext } from '../IDTSConnectionWizardContext';

export class DTSConnectionCustomPromptStep<T extends IDTSConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newDTSConnectionSetting = (await context.ui.showInputBox({
            prompt: localize('customDTSConnectionPrompt', 'Provide a custom DTS connection string.'),
            validateInput: (value: string | undefined) => this.validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newDTSConnectionSetting && context.dtsConnectionType === ConnectionType.Custom;
    }

    private validateInput(connectionString: string | undefined): string | undefined {
        connectionString = connectionString ? connectionString.trim() : '';
        
        // Check for basic character length validation
        if (!validationUtils.hasValidCharLength(connectionString)) {
            return validationUtils.getInvalidCharLengthMessage();
        }

        // Check if the connection string contains the required "Endpoint=" pattern
        const endpointMatch = connectionString.match(/Endpoint=([^;]+)/);
        if (!endpointMatch) {
            return localize('invalidDTSConnectionStringFormat', 'DTS connection string must contain an "Endpoint=" parameter. Expected format: "Endpoint=<URL>;Authentication=<AuthType>"');
        }

        // Validate that the endpoint URL is properly formatted
        const endpoint = endpointMatch[1];
        try {
            const url = new URL(endpoint);
            // Ensure it's using a valid protocol
            if (!['http:', 'https:'].includes(url.protocol)) {
                return localize('invalidDTSEndpointProtocol', 'DTS endpoint must use HTTP or HTTPS protocol. Found: {0}', url.protocol);
            }
        } catch (error) {
            return localize('invalidDTSEndpointURL', 'DTS endpoint is not a valid URL: {0}', endpoint);
        }

        // Check if the connection string contains an Authentication parameter with a non-empty value
        const authMatch = connectionString.match(/Authentication=([^;]*)/);
        if (!authMatch) {
            return localize('missingDTSAuthentication', 'DTS connection string must contain an "Authentication=" parameter. Expected format: "Endpoint=<URL>;Authentication=<AuthType>"');
        }
        
        // Validate that the Authentication parameter has a non-empty value
        const authValue = authMatch[1];
        if (!authValue || authValue.trim() === '') {
            return localize('emptyDTSAuthentication', 'DTS Authentication parameter cannot be empty. Expected format: "Endpoint=<URL>;Authentication=<AuthType>"');
        }

        return undefined;
    }
}
