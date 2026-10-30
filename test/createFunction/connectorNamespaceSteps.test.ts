/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GenericResource } from '@azure/arm-resources';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { type Progress } from 'vscode';
import { ConnectorNamespaceApiVersion, ConnectorNamespaceResourceType, webProvider } from '../../src/constants';
import {
    AzureConnectorNamespaceClient,
    type ConnectorNamespaceClient,
    type ConnectorNamespaceResourcesClient,
} from '../../src/commands/createFunction/connectorSteps/ConnectorNamespaceClient';
import { type ConnectorGatewayClientContext } from '../../src/commands/createFunction/connectorSteps/ConnectorGatewayClient';
import { ConnectorNamespaceCreateStep } from '../../src/commands/createFunction/connectorSteps/ConnectorNamespaceCreateStep';
import {
    ConnectorNamespaceNameStep,
    validateConnectorNamespaceName,
} from '../../src/commands/createFunction/connectorSteps/ConnectorNamespaceNameStep';
import { type IConnectorNamespaceWizardContext } from '../../src/commands/createFunction/connectorSteps/IConnectorNamespaceWizardContext';

suite('Connector Namespace wizard steps', () => {
    test('validates connector namespace names', () => {
        for (const name of ['ab', 'connector-namespace', 'connector_namespace', `a${'b'.repeat(63)}`]) {
            assert.strictEqual(validateConnectorNamespaceName(name), undefined, name);
        }

        for (const name of ['', 'a', '-namespace', '_namespace', 'connector namespace', 'connector/namespace', `a${'b'.repeat(64)}`]) {
            assert.ok(validateConnectorNamespaceName(name), name);
        }
    });

    test('checks name availability in the selected resource group', async () => {
        const checkedNames: string[] = [];
        const client: ConnectorNamespaceClient = {
            isNameAvailable: async (_context, resourceGroupName, namespaceName) => {
                assert.strictEqual(resourceGroupName, 'test-rg');
                checkedNames.push(namespaceName);
                return namespaceName !== 'taken-name';
            },
            create: async () => assert.fail('Name validation must not create a connector namespace.'),
        };
        const context = {
            resourceGroup: { name: 'test-rg' },
            valuesToMask: [],
            ui: {
                showInputBox: async (options: Parameters<IActionContext['ui']['showInputBox']>[0]) => {
                    assert.strictEqual(await options.validateInput?.('available_name'), undefined);
                    assert.strictEqual(
                        await options.asyncValidationTask?.('taken-name'),
                        'A connector namespace with this name already exists in the selected resource group.',
                    );
                    assert.strictEqual(await options.asyncValidationTask?.('available_name'), undefined);
                    return ' available_name ';
                },
            },
        } as unknown as IConnectorNamespaceWizardContext;

        await new ConnectorNamespaceNameStep(client).prompt(context);

        assert.strictEqual(context.newConnectorNamespaceName, 'available_name');
        assert.strictEqual(context.connectorNamespaceNameResourceGroup, 'test-rg');
        assert.deepStrictEqual(checkedNames, ['taken-name', 'available_name']);
        assert.deepStrictEqual(context.valuesToMask, ['taken-name', 'available_name']);
    });

    test('prompts again when Back navigation changes the resource group', () => {
        const context = {
            resourceGroup: { name: 'first-rg', location: 'eastus' },
            newConnectorNamespaceName: 'available-name',
            connectorNamespaceNameResourceGroup: 'first-rg',
        } as unknown as IConnectorNamespaceWizardContext;
        const step = new ConnectorNamespaceNameStep();

        assert.strictEqual(step.shouldPrompt(context), false);
        context.resourceGroup = { name: 'second-rg', location: 'eastus' };
        assert.strictEqual(step.shouldPrompt(context), true);
    });

    test('uses the connector gateway ARM contract', async () => {
        let getStatusCode: number | undefined;
        let getArguments: unknown[] | undefined;
        let createArguments: unknown[] | undefined;
        const createdResource: GenericResource = {
            id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/connectorGateways/test-namespace',
            name: 'test-namespace',
            location: 'eastus',
        };
        const resourcesClient = {
            get: async (...args: unknown[]) => {
                getArguments = args;
                if (getStatusCode) {
                    throw Object.assign(new Error('Request failed.'), { statusCode: getStatusCode });
                }
                return createdResource;
            },
            beginCreateOrUpdateAndWait: async (...args: unknown[]) => {
                createArguments = args;
                return createdResource;
            },
        } as unknown as ConnectorNamespaceResourcesClient;
        const client = new AzureConnectorNamespaceClient(async () => resourcesClient);
        const context = { valuesToMask: [] } as unknown as ConnectorGatewayClientContext;

        assert.strictEqual(await client.isNameAvailable(context, 'rg', 'test-namespace'), false);
        assert.deepStrictEqual(getArguments, [
            'rg',
            webProvider,
            '',
            ConnectorNamespaceResourceType,
            'test-namespace',
            ConnectorNamespaceApiVersion,
        ]);

        getStatusCode = 404;
        assert.strictEqual(await client.isNameAvailable(context, 'rg', 'test-namespace'), true);

        getStatusCode = 500;
        await assert.rejects(
            client.isNameAvailable(context, 'rg', 'test-namespace'),
            /Unable to check Connector Namespace name availability/,
        );

        assert.deepStrictEqual(await client.create(context, 'rg', 'test-namespace', 'eastus'), {
            ...createdResource,
            identity: undefined,
            managedBy: undefined,
            properties: undefined,
            tags: undefined,
            type: undefined,
        });
        assert.deepStrictEqual(createArguments, [
            'rg',
            webProvider,
            '',
            ConnectorNamespaceResourceType,
            'test-namespace',
            ConnectorNamespaceApiVersion,
            {
                location: 'eastus',
                properties: {},
                identity: {
                    type: 'SystemAssigned',
                },
            },
            {
                requestOptions: {
                    customHeaders: {
                        'If-None-Match': '*',
                    },
                },
                updateIntervalInMs: 3000,
            },
        ]);
    });

    test('creates the namespace with the selected resource group and location', async () => {
        const createdResource: GenericResource = {
            id: '/subscriptions/sub/resourceGroups/new-rg/providers/Microsoft.Web/connectorGateways/test-namespace',
            name: 'test-namespace',
            location: 'eastus',
        };
        let createArguments: [string, string, string] | undefined;
        const client: ConnectorNamespaceClient = {
            isNameAvailable: async () => true,
            create: async (_context, resourceGroupName, namespaceName, location) => {
                createArguments = [resourceGroupName, namespaceName, location];
                return createdResource;
            },
        };
        const context = {
            newResourceGroupName: 'new-rg',
            newConnectorNamespaceName: 'test-namespace',
            _location: {
                name: 'eastus',
                displayName: 'East US',
            },
            valuesToMask: [],
        } as unknown as IConnectorNamespaceWizardContext;
        let progressMessage: string | undefined;
        const progress = {
            report: value => {
                progressMessage = value.message;
            },
        } as Progress<{ message?: string; increment?: number }>;
        const step = new ConnectorNamespaceCreateStep(client);

        await step.execute(context, progress);

        assert.strictEqual(progressMessage, 'Creating connector namespace...');
        assert.deepStrictEqual(createArguments, ['new-rg', 'test-namespace', 'eastus']);
        assert.strictEqual(context.connectorNamespace, createdResource);
        assert.deepStrictEqual(context.valuesToMask, ['test-namespace']);
        assert.strictEqual(step.shouldExecute(context), false);
    });
});
