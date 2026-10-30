/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import {
    ConnectorTriggerPickerController,
    type ConnectorTriggerPickerLaunchOptions,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerPickerController';
import {
    ConnectorTriggerDataClient,
    type ConnectorArmClient,
    type ConnectorTriggerCatalog,
    type ConnectorSubscription,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerDataClient';
import { findConnectorProjectTemplates } from '../../src/commands/createNewProject/connectorTriggerPicker/connectorProjectTemplates';
import {
    createConnectorTriggerPickerViewModel,
} from '../../src/commands/createNewProject/connectorTriggerPicker/createConnectorTriggerPickerViewModel';
import {
    allowWebviewImageSources,
    escapeWebviewInitialData,
} from '../../src/commands/createNewProject/connectorTriggerPicker/escapeWebviewInitialData';
import { FunctionsTemplateGalleryController } from '../../src/commands/createNewProject/FunctionsTemplateGalleryController';
import { ProjectTemplateCreator } from '../../src/commands/createNewProject/ProjectTemplateCreator';
import {
    partitionConnectorOptions,
    shouldExpandOtherConnectors,
} from '../../src/webview/connectorTriggerPicker/connectorTriggerGroups';
import {
    isConnectorTriggerPickerMessage,
    isConnectorTriggerPickerResponse,
    type ConnectorNamespaceOption,
    type ConnectorTriggerPickerResponse,
    type ConnectorTriggerOption,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import {
    getDeliverySupport,
    partitionEventParameters,
} from '../../src/webview/connectorTriggerPicker/ConnectorConfigureStep';
import { ProjectLanguage } from '../../src/constants';
import { type IProjectTemplate, type TemplateCategory } from '../../src/templates/projectTemplates/IProjectTemplate';
import { type ProjectTemplateProvider } from '../../src/templates/projectTemplates/ProjectTemplateProvider';

suite('Connector trigger picker', () => {
    test('lists Connector Namespaces across subscriptions with paging and partial failure', async () => {
        const requests: string[] = [];
        const client = new ConnectorTriggerDataClient(
            async () => [
                createSubscription('sub-one', 'Subscription One'),
                createSubscription('sub-two', 'Subscription Two'),
            ],
            async context => {
                if (context.subscriptionId === 'sub-two') {
                    throw new Error('Subscription unavailable');
                }

                return {
                    async get(url: string): Promise<unknown> {
                        requests.push(url);
                        if (url.endsWith('/next-namespaces')) {
                            return {
                                value: [{
                                    id: '/subscriptions/sub-one/resourceGroups/rg-two/providers/Microsoft.Web/connectorGateways/zeta',
                                    name: 'zeta',
                                    location: 'westus',
                                }],
                            };
                        }

                        return {
                            value: [{
                                id: '/subscriptions/sub-one/resourceGroups/rg-one/providers/Microsoft.Web/connectorGateways/alpha',
                                name: 'alpha',
                                location: 'eastus2',
                            }],
                            nextLink: 'https://management.azure.com/next-namespaces',
                        };
                    },
                };
            },
        );

        const result = await client.listNamespaces(await createTestActionContext());

        assert.strictEqual(result.failedSubscriptionCount, 1);
        assert.deepStrictEqual(result.namespaces.map(namespace => ({
            name: namespace.name,
            resourceGroup: namespace.resourceGroup,
            subscriptionName: namespace.subscriptionName,
        })), [
            { name: 'alpha', resourceGroup: 'rg-one', subscriptionName: 'Subscription One' },
            { name: 'zeta', resourceGroup: 'rg-two', subscriptionName: 'Subscription One' },
        ]);
        assert.ok(requests[0].includes('/subscriptions/sub-one/providers/Microsoft.Web/connectorGateways'));
        assert.ok(requests[0].includes('api-version=2026-05-01-preview'));
        assert.strictEqual(requests[1], 'https://management.azure.com/next-namespaces');
    });

    test('loads live connectors and preserves paged trigger operations from the namespace API', async () => {
        const requests: string[] = [];
        const armClient: ConnectorArmClient = {
            async get(url: string): Promise<unknown> {
                requests.push(url);
                if (url.includes('/locations/eastus2/managedApis/office365')) {
                    return {
                        parameters: {
                            folderPathParameter: {
                                name: 'folderPath',
                                in: 'query',
                                type: 'string',
                                required: false,
                                'x-ms-summary': 'Folder',
                                'x-ms-dynamic-values': {
                                    operationId: 'ListFolders',
                                },
                            },
                        },
                        definitions: {
                            AdvancedFilters: {
                                type: 'object',
                                required: ['threshold'],
                                properties: {
                                    threshold: {
                                        type: 'integer',
                                        description: 'Minimum score.',
                                    },
                                },
                            },
                        },
                        paths: {
                            '/emails': {
                                get: {
                                    operationId: 'OnNewEmail',
                                    'x-ms-trigger': 'batch',
                                    parameters: [
                                        { name: 'connectionId', in: 'path', type: 'string' },
                                        { $ref: '#/parameters/folderPathParameter' },
                                        {
                                            name: 'importance',
                                            in: 'query',
                                            type: 'string',
                                            enum: ['any', 'high'],
                                            'x-ms-visibility': 'important',
                                            'x-ms-enum-values': [
                                                { value: 'any', displayName: 'Any' },
                                                { value: 'high', displayName: 'High' },
                                            ],
                                        },
                                        {
                                            name: 'includeAttachments',
                                            in: 'query',
                                            type: 'boolean',
                                            default: false,
                                        },
                                        {
                                            name: 'filters',
                                            in: 'body',
                                            required: true,
                                            schema: {
                                                type: 'object',
                                                required: ['advanced'],
                                                properties: {
                                                    advanced: {
                                                        $ref: '#/definitions/AdvancedFilters',
                                                    },
                                                },
                                            },
                                        },
                                        {
                                            name: 'x-ms-operation-context',
                                            in: 'header',
                                            type: 'string',
                                        },
                                    ],
                                },
                            },
                        },
                    };
                } else if (url === 'https://management.azure.com/managed-api-page-2') {
                    return {
                        value: [{
                            name: 'unused',
                            properties: {
                                generalInformation: {
                                    displayName: 'No Triggers',
                                    iconUri: 'http://example.com/not-allowed.png',
                                },
                            },
                        }],
                    };
                } else if (url === 'https://management.azure.com/operation-page-2') {
                    return {
                        value: [{
                            name: 'OnNewFile',
                            properties: {
                                summary: 'When a file is created',
                                isWebhook: false,
                                api: {
                                    name: 'sharepointonline',
                                    displayName: 'SharePoint',
                                    iconUri: 'connectoricons-prod.azureedge.net/sharepoint/icon.svg',
                                },
                            },
                        }, {
                            name: 'WebhookOnly',
                            properties: {
                                summary: 'Webhook-only event',
                                isWebhook: true,
                                api: {
                                    name: 'sharepointonline',
                                    displayName: 'SharePoint',
                                },
                            },
                        }],
                    };
                } else if (url.includes('/managedApiOperations?')) {
                    return {
                        value: [
                            {
                                name: 'OnNewEmailV1',
                                properties: {
                                    summary: 'When an email arrives (old)',
                                    annotation: { family: 'new-email', revision: 1 },
                                    api: {
                                        name: 'office365',
                                        displayName: 'Office 365 Outlook',
                                    },
                                },
                            },
                            {
                                name: 'OnNewEmail',
                                properties: {
                                    summary: 'When a new email arrives',
                                    triggerHint: 'Fires for new email.',
                                    isNotification: true,
                                    annotation: { family: 'new-email', revision: 2 },
                                    inputsDefinition: {
                                        type: 'object',
                                        required: ['folderPath'],
                                        properties: {
                                            folderPath: {
                                                type: 'string',
                                                description: 'Mail folder to monitor.',
                                                'x-ms-summary': 'Folder',
                                                'x-ms-dynamic-values': {
                                                    operationId: 'ListFolders',
                                                },
                                            },
                                            importance: {
                                                type: 'string',
                                                enum: ['any', 'high'],
                                            },
                                            includeAttachments: {
                                                type: 'boolean',
                                                default: false,
                                            },
                                        },
                                    },
                                    api: {
                                        name: 'office365',
                                        displayName: 'Office 365 Outlook',
                                    },
                                },
                            },
                            {
                                name: 'InternalTrigger',
                                properties: {
                                    visibility: 'internal',
                                    api: {
                                        name: 'office365',
                                        displayName: 'Office 365 Outlook',
                                    },
                                },
                            },
                        ],
                        nextLink: 'https://management.azure.com/operation-page-2',
                    };
                } else if (url.includes('/managedApis?')) {
                    return {
                        value: [{
                            name: 'office365',
                            properties: {
                                displayName: 'Office 365 Outlook',
                                description: 'Office mail and calendar.',
                                iconUri: 'connectoricons-prod.azureedge.net/office365/icon.png',
                            },
                        }],
                        nextLink: 'https://management.azure.com/managed-api-page-2',
                    };
                }

                assert.fail(`Unexpected URL: ${url}`);
            },
        };
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription('sub-one', 'Subscription One')],
            async () => armClient,
        );

        const catalog = await client.listCatalog(
            await createTestActionContext(),
            createNamespace(),
        );

        assert.deepStrictEqual(catalog.connectors, [
            {
                id: 'office365',
                label: 'Office 365 Outlook',
                description: 'Office mail and calendar.',
                iconUrl: 'https://connectoricons-prod.azureedge.net/office365/icon.png',
            },
            {
                id: 'sharepointonline',
                label: 'SharePoint',
                description: undefined,
                iconUrl: 'https://connectoricons-prod.azureedge.net/sharepoint/icon.svg',
            },
        ]);
        assert.deepStrictEqual(catalog.operations, [
            {
                id: 'OnNewEmail',
                connectorId: 'office365',
                label: 'When a new email arrives',
                description: 'Fires for new email.',
                isWebhook: false,
                isNotification: true,
                inputDefinitions: [
                    {
                        name: 'folderPath',
                        label: 'Folder',
                        description: 'Mail folder to monitor.',
                        type: 'string',
                        format: undefined,
                        required: true,
                        defaultValue: undefined,
                        options: undefined,
                        dynamic: true,
                        sensitive: false,
                    },
                    {
                        name: 'importance',
                        label: 'Importance',
                        description: undefined,
                        type: 'string',
                        format: undefined,
                        required: false,
                        defaultValue: undefined,
                        options: [
                            { label: 'any', value: 'any' },
                            { label: 'high', value: 'high' },
                        ],
                        dynamic: false,
                        sensitive: false,
                    },
                    {
                        name: 'includeAttachments',
                        label: 'Include Attachments',
                        description: undefined,
                        type: 'boolean',
                        format: undefined,
                        required: false,
                        defaultValue: false,
                        options: undefined,
                        dynamic: false,
                        sensitive: false,
                    },
                ],
            },
            {
                id: 'OnNewEmailV1',
                connectorId: 'office365',
                label: 'When an email arrives (old)',
                description: undefined,
                isWebhook: false,
                isNotification: false,
            },
            {
                id: 'OnNewFile',
                connectorId: 'sharepointonline',
                label: 'When a file is created',
                description: undefined,
                isWebhook: false,
                isNotification: false,
            },
        ]);

        const operationsRequest = new URL(requests.find(url => url.includes('/managedApiOperations?')) as string);
        assert.strictEqual(operationsRequest.searchParams.get('$filter'), "operationRole eq 'Trigger'");
        assert.strictEqual(operationsRequest.searchParams.get('$top'), '250');
        assert.ok(requests.includes('https://management.azure.com/operation-page-2'));
        assert.ok(requests.includes('https://management.azure.com/managed-api-page-2'));

        const inputs = await client.listOperationInputs(
            await createTestActionContext(),
            createNamespace(),
            'office365',
            'OnNewEmail',
        );
        assert.deepStrictEqual(inputs, [
            {
                name: 'folderPath',
                label: 'Folder',
                description: undefined,
                type: 'string',
                format: undefined,
                required: false,
                defaultValue: undefined,
                options: undefined,
                dynamic: true,
                sensitive: false,
            },
            {
                name: 'importance',
                label: 'Importance',
                description: undefined,
                type: 'string',
                format: undefined,
                required: false,
                defaultValue: undefined,
                options: [
                    { label: 'Any', value: 'any' },
                    { label: 'High', value: 'high' },
                ],
                dynamic: false,
                sensitive: false,
                visibility: 'important',
            },
            {
                name: 'includeAttachments',
                label: 'Include Attachments',
                description: undefined,
                type: 'boolean',
                format: undefined,
                required: false,
                defaultValue: false,
                options: undefined,
                dynamic: false,
                sensitive: false,
            },
            {
                name: 'advanced.threshold',
                label: 'Threshold',
                description: 'Minimum score.',
                type: 'integer',
                format: undefined,
                required: true,
                defaultValue: undefined,
                options: undefined,
                dynamic: false,
                sensitive: false,
            },
        ]);
        const swaggerRequest = new URL(requests.find(url =>
            url.includes('/locations/eastus2/managedApis/office365')) as string);
        assert.strictEqual(swaggerRequest.searchParams.get('api-version'), '2022-09-01-preview');
        assert.strictEqual(swaggerRequest.searchParams.get('export'), 'true');
        const inputGroups = partitionEventParameters(inputs);
        assert.deepStrictEqual(
            inputGroups.primary.map(input => input.name),
            ['folderPath', 'importance', 'advanced.threshold'],
        );
        assert.deepStrictEqual(
            inputGroups.optional.map(input => input.name),
            ['includeAttachments'],
        );
        await assert.rejects(
            client.listOperationInputs(
                await createTestActionContext(),
                createNamespace(),
                'office365',
                'MissingOperation',
            ),
            /input schema could not be loaded/,
        );
    });

    test('fails explicitly when every subscription namespace request fails', async () => {
        const client = new ConnectorTriggerDataClient(
            async () => [createSubscription('sub-one', 'Subscription One')],
            async () => { throw new Error('Unavailable'); },
        );

        await assert.rejects(
            client.listNamespaces(await createTestActionContext()),
            /Unable to load Connector Namespaces/,
        );
    });

    test('registers a newly selected subscription for immediate catalog loading', async () => {
        let requested = false;
        const subscription = createSubscription('new-sub', 'New Subscription');
        const client = new ConnectorTriggerDataClient(
            async () => [],
            async context => {
                assert.strictEqual(context.subscriptionId, 'new-sub');
                return {
                    async get(_url: string): Promise<unknown> {
                        requested = true;
                        return { value: [] };
                    },
                };
            },
        );
        client.registerSubscription(subscription.context);

        await client.listCatalog(await createTestActionContext(), {
            ...createNamespace(),
            subscriptionId: 'new-sub',
            subscriptionName: 'New Subscription',
        });

        assert.strictEqual(requested, true);
    });

    test('builds localized live-data picker labels', () => {
        const viewModel = createConnectorTriggerPickerViewModel();

        assert.strictEqual(viewModel.labels.panelTitle, 'Template Gallery');
        assert.strictEqual(viewModel.labels.galleryTitle, 'Template Gallery');
        assert.strictEqual(viewModel.labels.connectorPageTitle, 'Choose a connector');
        assert.strictEqual(viewModel.labels.eventPageTitle, 'Choose an event');
        assert.strictEqual(viewModel.labels.configurePageTitle, 'Configure & preview');
        assert.strictEqual(viewModel.labels.namespaceGroup, 'Connector Namespace');
        assert.strictEqual(viewModel.labels.createNamespace, '+ Create new Connector Namespace...');
        assert.strictEqual(viewModel.labels.connectorGroup, 'Connector');
        assert.strictEqual(viewModel.labels.featuredConnectors, 'Featured connectors');
        assert.strictEqual(viewModel.labels.otherConnectors, 'Other connectors ({0})');
        assert.strictEqual(viewModel.labels.eventParameters, 'Event parameters');
        assert.strictEqual(
            viewModel.labels.eventParametersDescription,
            'Configure the inputs defined by the selected connector event.',
        );
        assert.strictEqual(viewModel.labels.optionalParameters, 'Optional parameters ({0})');
    });

    test('groups featured connectors in the configured order and expands search results', () => {
        const connectors: ConnectorTriggerOption[] = [
            { id: 'salesforce', label: 'Salesforce' },
            { id: 'custom-office-helper', label: 'Office 365 helper' },
            { id: 'dataflows', label: 'Power Query Dataflows' },
            { id: 'teams', label: 'Microsoft Teams' },
            { id: 'OFFICE365', label: 'OFFICE 365 OUTLOOK' },
            { id: 'github', label: 'GitHub' },
            { id: 'sharepointonline', label: 'SharePoint' },
            { id: 'visualstudio-team-services', label: 'Azure DevOps' },
            { id: 'planner', label: 'Planner' },
            { id: 'onedriveforbusiness', label: 'OneDrive for Business' },
        ];

        const groups = partitionConnectorOptions(connectors);

        assert.deepStrictEqual(groups.featured.map(connector => connector.id), [
            'OFFICE365',
            'sharepointonline',
            'onedriveforbusiness',
            'teams',
            'planner',
            'salesforce',
            'visualstudio-team-services',
            'dataflows',
        ]);
        assert.deepStrictEqual(groups.other.map(connector => connector.id), [
            'custom-office-helper',
            'github',
        ]);
        assert.strictEqual(shouldExpandOtherConnectors('', false), false);
        assert.strictEqual(shouldExpandOtherConnectors('', true), true);
        assert.strictEqual(shouldExpandOtherConnectors('github', false), true);
    });

    test('derives allowed delivery modes from live trigger metadata', () => {
        assert.deepStrictEqual(
            getDeliverySupport({ isWebhook: false, isNotification: false }),
            { polling: true, webhook: false },
        );
        assert.deepStrictEqual(
            getDeliverySupport({ isWebhook: true, isNotification: false }),
            { polling: false, webhook: false },
        );
        assert.deepStrictEqual(
            getDeliverySupport({ isWebhook: false, isNotification: true }),
            { polling: true, webhook: false },
        );
    });

    test('resolves Outlook and SharePoint templates for every supported language', () => {
        const supportedLanguages = [
            [ProjectLanguage.CSharp, 'csharp'],
            [ProjectLanguage.TypeScript, 'typescript'],
            [ProjectLanguage.Python, 'python'],
        ] as const;
        const templates: IProjectTemplate[] = [
            ...supportedLanguages.flatMap(([language, slug]) => [
                createProjectTemplate(
                    `office365-connector-trigger-${slug}`,
                    'Office 365 Outlook Connector Triggers',
                    'connector',
                    language,
                ),
                createProjectTemplate(
                    `sharepoint-connector-trigger-${slug}`,
                    'SharePoint Online Connector Triggers',
                    'connector',
                    language,
                ),
            ]),
            createProjectTemplate('http-python', 'HTTP Trigger', 'http'),
        ];

        for (const [language, slug] of supportedLanguages) {
            const languageTemplates = templates.filter(template =>
                template.languages.includes(language));
            assert.deepStrictEqual(
                findConnectorProjectTemplates(languageTemplates, {
                    id: 'office365',
                    label: 'Office 365 Outlook',
                }).map(template => template.id),
                [`office365-connector-trigger-${slug}`],
            );
            assert.deepStrictEqual(
                findConnectorProjectTemplates(languageTemplates, {
                    id: 'sharepointonline',
                    label: 'SharePoint',
                }).map(template => template.id),
                [`sharepoint-connector-trigger-${slug}`],
            );
        }
        assert.deepStrictEqual(
            findConnectorProjectTemplates(templates, {
                id: 'unknown',
                label: 'Unknown Connector',
            }),
            [],
        );
    });

    test('uses the manifest git ref when creating a connector project', () => {
        const creator = new ProjectTemplateCreator() as unknown as {
            buildZipUrl(repositoryUrl: string, archiveRef: string): string;
            resolveGitReference(
                template: Pick<IProjectTemplate, 'branch' | 'gitRef'>,
            ): { archiveRef: string; cloneRef: string };
        };
        const tag = creator.resolveGitReference({ gitRef: 'refs/tags/v1.0.2' });
        const branch = creator.resolveGitReference({ branch: 'feature/connectors' });

        assert.deepStrictEqual(tag, {
            archiveRef: 'refs/tags/v1.0.2',
            cloneRef: 'v1.0.2',
        });
        assert.deepStrictEqual(branch, {
            archiveRef: 'refs/heads/feature/connectors',
            cloneRef: 'feature/connectors',
        });
        assert.strictEqual(
            creator.buildZipUrl('https://github.com/Azure-Samples/functions-connectors-python', tag.archiveRef),
            'https://github.com/Azure-Samples/functions-connectors-python/archive/refs/tags/v1.0.2.zip',
        );
    });

    test('creates the selected connector project directly without reopening the gallery', async () => {
        const namespace = createNamespace();
        const connector: ConnectorTriggerOption = {
            id: 'office365',
            label: 'Office 365 Outlook',
        };
        const catalog: ConnectorTriggerCatalog = {
            connectors: [connector],
            operations: [{
                id: 'OnNewEmail',
                connectorId: connector.id,
                label: 'When a new email arrives',
                isWebhook: false,
                isNotification: true,
            }],
        };
        const template = createProjectTemplate(
            'office365-connector-trigger-python',
            'Office 365 Outlook Connector Triggers',
        );
        const createdProjects: {
            template: IProjectTemplate;
            language: string;
            location: string;
            entryPoint: string | undefined;
        }[] = [];
        const responses: ConnectorTriggerPickerResponse[] = [];
        interface TestableConnectorTriggerPickerController {
            launchOptions: ConnectorTriggerPickerLaunchOptions;
            namespaces: Map<string, ConnectorNamespaceOption>;
            catalogs: Map<string, ConnectorTriggerCatalog>;
            templateProvider: Pick<ProjectTemplateProvider, 'getTemplates'>;
            projectCreator: Pick<ProjectTemplateCreator, 'createProject'>;
            postMessage(message: ConnectorTriggerPickerResponse): Promise<void>;
            createSelectedProject(
                context: IActionContext,
                selectedConnector: ConnectorTriggerOption,
            ): Promise<void>;
        }
        const controllerMethods = ConnectorTriggerPickerController.prototype as unknown as {
            handleMessage(
                this: TestableConnectorTriggerPickerController,
                message: unknown,
                context: IActionContext,
            ): Promise<void>;
            createSelectedProject(
                this: TestableConnectorTriggerPickerController,
                context: IActionContext,
                selectedConnector: ConnectorTriggerOption,
            ): Promise<void>;
        };
        const testableController: TestableConnectorTriggerPickerController = {
            launchOptions: {
                isProjectWizard: true,
                language: ProjectLanguage.Python,
                initialLocation: 'C:\\connector-project',
                initialFilters: {
                    language: 'python',
                    resource: 'connector',
                    useCase: 'connector',
                },
            },
            namespaces: new Map([[namespace.id, namespace]]),
            catalogs: new Map([[namespace.id, catalog]]),
            templateProvider: {
                getTemplates: async () => [template],
            },
            projectCreator: {
                createProject: async (_context, selectedTemplate, language, location, entryPoint) => {
                    createdProjects.push({
                        template: selectedTemplate,
                        language,
                        location,
                        entryPoint,
                    });
                },
            },
            postMessage: async response => {
                responses.push(response);
            },
            createSelectedProject(context, selectedConnector) {
                return controllerMethods.createSelectedProject.call(
                    this,
                    context,
                    selectedConnector,
                );
            },
        };

        const originalCreateOrShow = FunctionsTemplateGalleryController.createOrShow;
        FunctionsTemplateGalleryController.createOrShow = () => {
            throw new Error('Template Gallery should not be opened.');
        };
        try {
            await controllerMethods.handleMessage.call(testableController, {
                command: 'continue',
                namespaceId: namespace.id,
                connectorId: connector.id,
                operationId: catalog.operations[0].id,
                deliveryMode: 'Polling',
            }, await createTestActionContext());
        } finally {
            FunctionsTemplateGalleryController.createOrShow = originalCreateOrShow;
        }

        assert.deepStrictEqual(responses, [{ command: 'projectCreationStarted' }]);
        assert.deepStrictEqual(createdProjects, [{
            template,
            language: ProjectLanguage.Python,
            location: 'C:\\connector-project',
            entryPoint: 'details',
        }]);

        responses.length = 0;
        testableController.launchOptions = {
            ...testableController.launchOptions,
            isProjectWizard: false,
        };
        await controllerMethods.createSelectedProject.call(
            testableController,
            await createTestActionContext(),
            connector,
        );
        assert.deepStrictEqual(responses, [{
            command: 'projectCreationFailed',
            message: 'Adding a connector trigger to an existing project is not supported yet.',
        }]);
        assert.strictEqual(createdProjects.length, 1);
    });

    test('escapes initial data and allows HTTPS API-provided icons', () => {
        const template = "before _initialData: 'don't'\nafter";

        assert.strictEqual(
            escapeWebviewInitialData(template),
            "before _initialData: 'don%27t'\nafter",
        );
        assert.strictEqual(
            allowWebviewImageSources(
                'img-src vscode-webview: https://*.vscode-cdn.net data:;',
                ['https:'],
            ),
            'img-src vscode-webview: https://*.vscode-cdn.net data: https:;',
        );
        assert.throws(
            () => escapeWebviewInitialData("before _initialData: 'unterminated"),
            /Unable to locate/,
        );
    });

    test('accepts only the live picker request and response contracts', () => {
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'loadNamespaces' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'createNamespace' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'browseTemplates' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'openCopilot' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadCatalog',
            namespaceId: 'namespace-id',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadOperationInputs',
            namespaceId: 'namespace-id',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            namespaceId: 'namespace-id',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
            deliveryMode: 'Webhook',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            connectorId: 'sharepointonline',
        }), false);

        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'namespacesLoaded',
            namespaces: [],
            selectedNamespaceId: 'namespace-id',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'catalogLoaded',
            namespaceId: 'namespace-id',
            connectors: [],
            operations: [],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'operationInputsLoaded',
            namespaceId: 'namespace-id',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
            inputDefinitions: [],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'operationInputsFailed',
            namespaceId: 'namespace-id',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
            message: 'Failed',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'namespaceCreationCancelled',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'projectCreationStarted',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'projectCreationProgress',
            detail: 'Cloning template...',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'projectCreationFailed',
            message: 'No template found.',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'loadFailed',
            scope: 'catalog',
            namespaceId: 'namespace-id',
            message: 'Failed',
        }), true);
    });
});

function createSubscription(
    subscriptionId: string,
    subscriptionDisplayName: string,
): ConnectorSubscription {
    return {
        subscriptionId,
        subscriptionDisplayName,
        context: {
            subscriptionId,
            subscriptionDisplayName,
            environment: {
                resourceManagerEndpointUrl: 'https://management.azure.com',
            },
        } as ISubscriptionContext,
    };
}

function createNamespace(): ConnectorNamespaceOption {
    return {
        id: '/subscriptions/sub-one/resourceGroups/rg-one/providers/Microsoft.Web/connectorGateways/gateway-one',
        name: 'gateway-one',
        label: 'gateway-one',
        location: 'eastus2',
        resourceGroup: 'rg-one',
        subscriptionId: 'sub-one',
        subscriptionName: 'Subscription One',
    };
}

function createProjectTemplate(
    id: string,
    displayName: string,
    resource: string = 'connector',
    language: ProjectLanguage = ProjectLanguage.Python,
): IProjectTemplate {
    return {
        id,
        displayName,
        shortDescription: displayName,
        categories: ['connectors' as TemplateCategory],
        languages: [language],
        repositoryUrl: 'https://example.invalid/template',
        resource,
    } as IProjectTemplate;
}
