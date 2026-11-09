/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import {
    ConnectorTriggerPickerController,
    type ConnectorTriggerCatalogLoadResult,
    type ConnectorTriggerPickerLaunchOptions,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerPickerController';
import {
    ConnectorTriggerDataClient,
    type ConnectorTriggerAzureContext,
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
import {
    ProjectTemplateCreator,
    type ProjectTemplateCreationOptions,
} from '../../src/commands/createNewProject/ProjectTemplateCreator';
import { type ConnectorTriggerOutputMetadata } from '../../src/connectorTrigger/connectorTriggerOutputSchema';
import { type ConnectorTriggerSelection } from '../../src/connectorTrigger/connectorTriggerSelection';
import {
    partitionConnectorOptions,
    shouldExpandOtherConnectors,
} from '../../src/webview/connectorTriggerPicker/connectorTriggerGroups';
import {
    isConnectorTriggerPickerMessage,
    isConnectorTriggerPickerResponse,
    type ConnectorTriggerPickerResponse,
    type ConnectorTriggerOption,
} from '../../src/webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { ProjectLanguage } from '../../src/constants';
import { type IProjectTemplate, type TemplateCategory } from '../../src/templates/projectTemplates/IProjectTemplate';
import { type ProjectTemplateProvider } from '../../src/templates/projectTemplates/ProjectTemplateProvider';

suite('Connector trigger picker', () => {
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

        await client.getCatalog(await createTestActionContext(), {
            ...createAzureContext(),
            subscriptionId: 'new-sub',
            subscriptionName: 'New Subscription',
        });

        assert.strictEqual(requested, true);
    });

    test('builds localized catalog picker labels', () => {
        const viewModel = createConnectorTriggerPickerViewModel();

        assert.strictEqual(viewModel.labels.panelTitle, 'Template Gallery');
        assert.strictEqual(viewModel.labels.galleryTitle, 'Template Gallery');
        assert.strictEqual(viewModel.labels.connectorPageTitle, 'Choose a connector');
        assert.strictEqual(viewModel.labels.eventPageTitle, 'Choose an event');
        assert.strictEqual(
            viewModel.labels.azureContextRequired,
            'Azure sign-in, a subscription, and a region are required before you can browse Connector Triggers.',
        );
        assert.strictEqual(
            viewModel.labels.selectSubscription,
            'Select a subscription',
        );
        assert.strictEqual(
            viewModel.labels.selectRegion,
            'Select a region',
        );
        assert.strictEqual(
            viewModel.labels.recommendedRegions,
            'Recommended',
        );
        assert.strictEqual(
            viewModel.labels.otherRegions,
            'Other',
        );
        assert.strictEqual(
            viewModel.labels.showAllSubscriptions,
            'Show all subscriptions...',
        );
        assert.ok(!('catalogSetupDeferred' in viewModel.labels));
        assert.strictEqual(viewModel.labels.connectorGroup, 'Connector');
        assert.strictEqual(viewModel.labels.featuredConnectors, 'Featured connectors');
        assert.strictEqual(viewModel.labels.otherConnectors, 'Other connectors ({0})');
        assert.strictEqual(
            viewModel.labels.pollingEventDelivery,
            'Polling',
        );
        assert.strictEqual(
            viewModel.labels.webhookEventDelivery,
            'Webhook - creation is not supported yet',
        );
    });

    test('groups featured connectors in the configured order and expands search results', () => {
        const connectors: ConnectorTriggerOption[] = [
            { id: 'salesforce', label: 'Salesforce', eventSupport: 'poll' },
            { id: 'custom-office-helper', label: 'Office 365 helper', eventSupport: 'poll' },
            { id: 'dataflows', label: 'Power Query Dataflows', eventSupport: 'poll' },
            { id: 'teams', label: 'Microsoft Teams', eventSupport: 'poll' },
            { id: 'OFFICE365', label: 'OFFICE 365 OUTLOOK', eventSupport: 'poll' },
            { id: 'github', label: 'GitHub', eventSupport: 'poll' },
            { id: 'sharepointonline', label: 'SharePoint', eventSupport: 'poll' },
            { id: 'visualstudio-team-services', label: 'Azure DevOps', eventSupport: 'poll' },
            { id: 'planner', label: 'Planner', eventSupport: 'poll' },
            { id: 'onedriveforbusiness', label: 'OneDrive for Business', eventSupport: 'poll' },
            {
                id: 'adobesign',
                label: 'Adobe Acrobat Sign',
                eventSupport: 'webhook-only',
            },
            {
                id: 'kusto',
                label: 'Azure Data Explorer',
                eventSupport: 'none',
            },
            {
                id: 'pending',
                label: 'Pending metadata',
                eventSupport: 'unknown',
            },
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
            'adobesign',
            'kusto',
            'pending',
        ]);
        assert.strictEqual(shouldExpandOtherConnectors('', false), false);
        assert.strictEqual(shouldExpandOtherConnectors('', true), true);
        assert.strictEqual(shouldExpandOtherConnectors('github', false), true);
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
            ): { archiveRef: string; cloneRef: string; isCommit: boolean };
        };
        const tag = creator.resolveGitReference({ gitRef: 'refs/tags/v1.0.2' });
        const branch = creator.resolveGitReference({ branch: 'feature/connectors' });
        const commit = creator.resolveGitReference({
            gitRef: '0123456789abcdef0123456789abcdef01234567',
        });

        assert.deepStrictEqual(tag, {
            archiveRef: 'refs/tags/v1.0.2',
            cloneRef: 'v1.0.2',
            isCommit: false,
        });
        assert.deepStrictEqual(branch, {
            archiveRef: 'refs/heads/feature/connectors',
            cloneRef: 'feature/connectors',
            isCommit: false,
        });
        assert.deepStrictEqual(commit, {
            archiveRef: '0123456789abcdef0123456789abcdef01234567',
            cloneRef: '0123456789abcdef0123456789abcdef01234567',
            isCommit: true,
        });
        assert.strictEqual(
            creator.buildZipUrl('https://github.com/Azure-Samples/functions-connectors-python', tag.archiveRef),
            'https://github.com/Azure-Samples/functions-connectors-python/archive/refs/tags/v1.0.2.zip',
        );
    });

    test('creates the selected connector project directly without reopening the gallery', async () => {
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
        const azureContext = createAzureContext();
        const selectedSubscriptionContext = {
            subscriptionId: azureContext.subscriptionId,
            subscriptionDisplayName: azureContext.subscriptionName,
            tenantId: 'tenant-one',
            environment: {
                name: 'AzureCloud',
                resourceManagerEndpointUrl: 'https://management.azure.com/',
            },
        } as ISubscriptionContext;
        const createdProjects: {
            template: IProjectTemplate;
            language: string;
            location: string;
            entryPoint: string | undefined;
            options: ProjectTemplateCreationOptions | undefined;
        }[] = [];
        const addedTriggers: {
            language: string;
            location: string;
            selection: ConnectorTriggerSelection;
            outputMetadata: ConnectorTriggerOutputMetadata | undefined;
        }[] = [];
        const outputMetadata: ConnectorTriggerOutputMetadata = {
            limitation: 'unsupported-output-schema',
        };
        const outputRequests: {
            connectorId: string;
            operationId: string;
        }[] = [];
        const responses: ConnectorTriggerPickerResponse[] = [];
        interface TestableConnectorTriggerPickerController {
            launchOptions: ConnectorTriggerPickerLaunchOptions;
            azureContext: ConnectorTriggerAzureContext | undefined;
            subscriptionContext: ISubscriptionContext | undefined;
            catalogs: Map<string, ConnectorTriggerCatalogLoadResult>;
            catalogLoadRequests: Map<string, Promise<ConnectorTriggerCatalogLoadResult>>;
            dataClient: Pick<
                ConnectorTriggerDataClient,
                'getConnectorOperationOutputMetadata'
            >;
            templateProvider: Pick<ProjectTemplateProvider, 'getTemplates'>;
            projectCreator: Pick<
                ProjectTemplateCreator,
                'addConnectorTrigger' | 'createProject'
            >;
            postMessage(message: ConnectorTriggerPickerResponse): Promise<void>;
            createSelectedProject(
                context: IActionContext,
                selection: {
                    azureContext: ConnectorTriggerAzureContext;
                    connector: ConnectorTriggerOption;
                    operation: ConnectorTriggerCatalog['operations'][number];
                },
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
                selection: {
                    azureContext: ConnectorTriggerAzureContext;
                    connector: ConnectorTriggerOption;
                    operation: ConnectorTriggerCatalog['operations'][number];
                },
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
            azureContext,
            subscriptionContext: selectedSubscriptionContext,
            catalogLoadRequests: new Map(),
            catalogs: new Map([[`${azureContext.subscriptionId}:${azureContext.region}`, {
                catalog,
            }]]),
            dataClient: {
                getConnectorOperationOutputMetadata: async (
                    _context,
                    _selectedContext,
                    connectorId,
                    operationId,
                ) => {
                    outputRequests.push({ connectorId, operationId });
                    return outputMetadata;
                },
            },
            templateProvider: {
                getTemplates: async () => [template],
            },
            projectCreator: {
                addConnectorTrigger: async (
                    _context,
                    language,
                    location,
                    selection,
                    selectedOutputMetadata,
                ) => {
                    addedTriggers.push({
                        language,
                        location,
                        selection,
                        outputMetadata: selectedOutputMetadata,
                    });
                },
                createProject: async (
                    _context,
                    selectedTemplate,
                    language,
                    location,
                    entryPoint,
                    options,
                ) => {
                    createdProjects.push({
                        template: selectedTemplate,
                        language,
                        location,
                        entryPoint,
                        options,
                    });
                },
            },
            postMessage: async response => {
                responses.push(response);
            },
            createSelectedProject(context, selection) {
                return controllerMethods.createSelectedProject.call(
                    this,
                    context,
                    selection,
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
                connectorId: connector.id,
                operationId: catalog.operations[0].id,
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
            options: {
                connectorTriggerSelection: {
                    connectorId: connector.id,
                    operationId: catalog.operations[0].id,
                },
            },
        }]);
        assert.deepStrictEqual(outputRequests, []);

        connector.availability = 'unavailable';
        await controllerMethods.handleMessage.call(testableController, {
            command: 'continue',
            connectorId: connector.id,
            operationId: catalog.operations[0].id,
        }, await createTestActionContext());
        assert.strictEqual(createdProjects.length, 1);
        assert.deepStrictEqual(responses[1], {
            command: 'projectCreationFailed',
            message: 'The selected connector or event is no longer available. Choose another selection.',
        });
        connector.availability = undefined;

        responses.length = 0;
        testableController.launchOptions = {
            ...testableController.launchOptions,
            isProjectWizard: false,
        };
        await controllerMethods.createSelectedProject.call(
            testableController,
            await createTestActionContext(),
            {
                azureContext,
                connector,
                operation: catalog.operations[0],
            },
        );
        assert.deepStrictEqual(responses, [{
            command: 'projectCreationStarted',
        }]);
        assert.strictEqual(createdProjects.length, 1);
        assert.deepStrictEqual(addedTriggers, [{
            language: ProjectLanguage.Python,
            location: 'C:\\connector-project',
            selection: {
                connectorId: connector.id,
                operationId: catalog.operations[0].id,
            },
            outputMetadata,
        }]);
        assert.deepStrictEqual(outputRequests, [{
            connectorId: connector.id,
            operationId: catalog.operations[0].id,
        }]);
    });

    test('blocks webhook creation before schema, template, or creator work', async () => {
        const azureContext = createAzureContext();
        const connector: ConnectorTriggerOption = {
            id: 'adobesign',
            label: 'Adobe Acrobat Sign',
        };
        const operation: ConnectorTriggerCatalog['operations'][number] = {
            id: 'CreateWebhookForAgreementCreatedEvent',
            connectorId: connector.id,
            label: 'When a new agreement is created',
            isWebhook: true,
            isNotification: false,
        };
        const subscriptionContext = {
            subscriptionId: azureContext.subscriptionId,
            subscriptionDisplayName: azureContext.subscriptionName,
            tenantId: 'tenant-one',
            environment: {
                name: 'AzureCloud',
                resourceManagerEndpointUrl: 'https://management.azure.com/',
            },
        } as ISubscriptionContext;
        const methods = ConnectorTriggerPickerController.prototype as unknown as {
            createSelectedProject(
                this: unknown,
                context: IActionContext,
                selection: {
                    azureContext: ConnectorTriggerAzureContext;
                    connector: ConnectorTriggerOption;
                    operation: ConnectorTriggerCatalog['operations'][number];
                },
            ): Promise<void>;
            handleMessage(
                this: unknown,
                message: unknown,
                context: IActionContext,
            ): Promise<void>;
        };

        for (const isProjectWizard of [true, false]) {
            const responses: ConnectorTriggerPickerResponse[] = [];
            let schemaRequests = 0;
            let templateRequests = 0;
            let creatorCalls = 0;
            const controller = Object.assign(
                Object.create(ConnectorTriggerPickerController.prototype),
                {
                    azureContext,
                    catalogs: new Map([[`${azureContext.subscriptionId}:${azureContext.region}`, {
                        catalog: {
                            connectors: [connector],
                            operations: [operation],
                        },
                    }]]),
                    catalogLoadRequests: new Map(),
                    dataClient: {
                        getConnectorOperationOutputMetadata: async () => {
                            schemaRequests += 1;
                            return { limitation: 'definition-unavailable' as const };
                        },
                    },
                    launchOptions: {
                        isProjectWizard,
                        language: ProjectLanguage.TypeScript,
                        initialLocation: 'C:\\connector-project',
                        initialFilters: {
                            language: 'typescript',
                            resource: 'connector',
                            useCase: 'connector',
                        },
                    },
                    postMessage: async (message: ConnectorTriggerPickerResponse) => {
                        responses.push(message);
                    },
                    projectCreator: {
                        addConnectorTrigger: async () => {
                            creatorCalls += 1;
                        },
                        createProject: async () => {
                            creatorCalls += 1;
                        },
                    },
                    subscriptionContext,
                    templateProvider: {
                        getTemplates: async () => {
                            templateRequests += 1;
                            return [];
                        },
                    },
                },
            );
            const context = await createTestActionContext();

            await methods.createSelectedProject.call(controller, context, {
                azureContext,
                connector,
                operation,
            });
            await methods.handleMessage.call(controller, {
                command: 'continue',
                connectorId: connector.id,
                operationId: operation.id,
            }, context);

            assert.deepStrictEqual(responses, [{
                command: 'projectCreationFailed',
                message: 'Webhook Connector Triggers are not supported yet. Choose a polling event.',
            }, {
                command: 'projectCreationFailed',
                message: 'Webhook Connector Triggers are not supported yet. Choose a polling event.',
            }]);
            assert.strictEqual(schemaRequests, 0);
            assert.strictEqual(templateRequests, 0);
            assert.strictEqual(creatorCalls, 0);
            assert.strictEqual(
                context.telemetry.properties.connectorSelected,
                undefined,
            );
        }
    });

    test('uses language genericApp when no specialized operation is available', async () => {
        const azureContext = createAzureContext();
        const subscriptionContext = {
            subscriptionId: azureContext.subscriptionId,
            subscriptionDisplayName: azureContext.subscriptionName,
            tenantId: 'tenant-one',
            environment: {
                name: 'AzureCloud',
                resourceManagerEndpointUrl: 'https://management.azure.com/',
            },
        } as ISubscriptionContext;
        const specializedConnector: ConnectorTriggerOption = {
            id: 'office365',
            label: 'Office 365 Outlook',
        };
        const unmappedConnector: ConnectorTriggerOption = {
            id: 'customconnector',
            label: 'Custom Connector',
        };
        const specializedTemplate = createProjectTemplate(
            'office365-connector-trigger-typescript',
            'Office 365 Outlook Connector Triggers',
            'connector',
            ProjectLanguage.TypeScript,
        );
        const genericTemplates = new Map<ProjectLanguage, {
            id: string;
            repositoryUrl: string;
            gitRef: string;
        }>([
            [ProjectLanguage.CSharp, {
                id: 'generic-connector-trigger-csharp',
                repositoryUrl: 'https://github.com/Azure-Samples/functions-connectors-net',
                gitRef: '01698c55fd05899cc15aa540ab86f8103cb0d5fe',
            }],
            [ProjectLanguage.TypeScript, {
                id: 'generic-connector-trigger-typescript',
                repositoryUrl: 'https://github.com/Azure-Samples/functions-connectors-typescript',
                gitRef: '3bb7fff156eb1856d16cc8488599a2f28fbd8522',
            }],
            [ProjectLanguage.Python, {
                id: 'generic-connector-trigger-python',
                repositoryUrl: 'https://github.com/Azure-Samples/functions-connectors-python',
                gitRef: 'fecf4d0666e84e07291355ac9e40904397bf6749',
            }],
        ]);
        const createSelectedProject = (
            ConnectorTriggerPickerController.prototype as unknown as {
                createSelectedProject(
                    this: {
                        azureContext: ConnectorTriggerAzureContext;
                        dataClient: Pick<
                            ConnectorTriggerDataClient,
                            'getConnectorOperationOutputMetadata'
                        >;
                        launchOptions: ConnectorTriggerPickerLaunchOptions;
                        postMessage(message: ConnectorTriggerPickerResponse): Promise<void>;
                        projectCreator: Pick<
                            ProjectTemplateCreator,
                            'addConnectorTrigger' | 'createProject'
                        >;
                        subscriptionContext: ISubscriptionContext;
                        templateProvider: Pick<ProjectTemplateProvider, 'getTemplates'>;
                    },
                    context: IActionContext,
                    selection: {
                        azureContext: ConnectorTriggerAzureContext;
                        connector: ConnectorTriggerOption;
                        operation: ConnectorTriggerCatalog['operations'][number];
                    },
                ): Promise<void>;
            }
        ).createSelectedProject;

        for (const [language, expectedTemplate] of genericTemplates) {
            for (const [connector, operationId] of [
                [specializedConnector, 'CalendarGetOnChangedItemsV3'],
                [unmappedConnector, 'OnCustomPollEvent'],
            ] as const) {
                const responses: ConnectorTriggerPickerResponse[] = [];
                const createdProjects: {
                    template: IProjectTemplate;
                    options: ProjectTemplateCreationOptions | undefined;
                }[] = [];
                const controller = {
                    azureContext,
                    dataClient: {
                        getConnectorOperationOutputMetadata: async () => ({
                            limitation: 'definition-unavailable' as const,
                        }),
                    },
                    launchOptions: {
                        isProjectWizard: true,
                        language,
                        initialLocation: 'C:\\connector-project',
                        initialFilters: {
                            language,
                            resource: 'connector',
                            useCase: 'connector',
                        },
                    },
                    postMessage: async (message: ConnectorTriggerPickerResponse) => {
                        responses.push(message);
                    },
                    projectCreator: {
                        addConnectorTrigger: async () => undefined,
                        createProject: async (
                            _context: IActionContext,
                            template: IProjectTemplate,
                            _language: string,
                            _location: string,
                            _entryPoint: string | undefined,
                            options: ProjectTemplateCreationOptions | undefined,
                        ) => {
                            createdProjects.push({ template, options });
                        },
                    },
                    subscriptionContext,
                    templateProvider: {
                        getTemplates: async () => [specializedTemplate],
                    },
                };

                await createSelectedProject.call(
                    controller,
                    await createTestActionContext(),
                    {
                        azureContext,
                        connector,
                        operation: {
                            id: operationId,
                            connectorId: connector.id,
                            label: operationId,
                            isWebhook: false,
                            isNotification: true,
                        },
                    },
                );

                assert.deepStrictEqual(responses, [{
                    command: 'projectCreationStarted',
                }]);
                assert.strictEqual(createdProjects.length, 1);
                assert.strictEqual(
                    createdProjects[0].template.id,
                    expectedTemplate.id,
                );
                assert.strictEqual(
                    createdProjects[0].template.repositoryUrl,
                    expectedTemplate.repositoryUrl,
                );
                assert.strictEqual(createdProjects[0].template.folderPath, 'genericApp');
                assert.strictEqual(
                    createdProjects[0].template.gitRef,
                    expectedTemplate.gitRef,
                );
                assert.deepStrictEqual(
                    createdProjects[0].options?.connectorTriggerSelection?.connectorId,
                    connector.id,
                );
                assert.deepStrictEqual(
                    createdProjects[0].options?.connectorTriggerSelection?.operationId,
                    operationId,
                );
                assert.deepStrictEqual(
                    createdProjects[0].options?.connectorTriggerOutputMetadata,
                    { limitation: 'definition-unavailable' },
                );
                assert.strictEqual(createdProjects[0].template.connectorTrigger, undefined);
            }
        }
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

    test('accepts only the picker request and response contracts', () => {
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'initialize' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'signIn' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'browseTemplates' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'openCopilot' }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'selectSubscription',
            subscriptionId: 'sub-one',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'selectRegion',
            subscriptionId: 'sub-one',
            region: 'eastus2',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadCatalog',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadAllSubscriptions',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadFilteredSubscriptions',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadConnectorOperations',
            connectorId: 'office365',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'retryConnectorDiscovery',
        }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'loadOperationInputs',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
        }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({ command: 'createNamespace' }), false);
        assert.strictEqual(isConnectorTriggerPickerMessage({
            command: 'continue',
            connectorId: 'sharepointonline',
        }), false);

        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'azureContextSelected',
            azureContext: {
                subscriptionId: 'sub-one',
                subscriptionName: 'Subscription One',
                region: 'eastus2',
                regionDisplayName: 'East US 2',
            },
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'azureContextRequired',
            message: 'Azure context is required.',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'subscriptionsLoaded',
            subscriptions: [{ id: 'sub-one', label: 'Subscription One' }],
            showingAll: false,
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'locationsLoaded',
            subscriptionId: 'sub-one',
            locations: [{
                name: 'eastus2',
                label: 'East US 2',
                regionCategory: 'Recommended',
            }, {
                name: 'westcentralus',
                label: 'West Central US',
            }],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'locationsLoaded',
            subscriptionId: 'sub-one',
            locations: [{
                name: 'eastus2',
                label: 'East US 2',
                regionCategory: 1,
            }],
        }), false);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'catalogLoaded',
            connectors: [],
            operations: [],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'connectorDiscoveryProgress',
            classifications: [{
                connectorId: 'office365',
                eventSupport: 'poll',
            }],
            failed: 1,
            inProgress: true,
            processed: 2,
            total: 3,
        }), false);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'connectorOperationsLoaded',
            connectorId: 'office365',
            eventSupport: 'poll',
            operations: [],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'connectorOperationsLoaded',
            connectorId: 'adobesign',
            eventSupport: 'webhook-only',
            operations: [],
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'connectorOperationsLoaded',
            connectorId: 'adobesign',
            eventSupport: 'unknown',
            operations: [],
        }), false);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'connectorOperationsFailed',
            connectorId: 'office365',
            message: 'Failed',
        }), true);
        assert.strictEqual(isConnectorTriggerPickerResponse({
            command: 'operationInputsFailed',
            connectorId: 'sharepointonline',
            operationId: 'OnNewFile',
            message: 'Failed',
        }), false);
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

function createAzureContext(): ConnectorTriggerAzureContext {
    return {
        subscriptionId: 'sub-one',
        subscriptionName: 'Subscription One',
        region: 'eastus2',
        regionDisplayName: 'East US 2',
    };
}

function createProjectTemplate(
    id: string,
    displayName: string,
    resource: string = 'connector',
    language: ProjectLanguage = ProjectLanguage.Python,
): IProjectTemplate {
    const operation = id.startsWith('office365-connector-trigger-') ?
        {
            operationId: 'OnNewEmail',
            functionName: 'OnNewEmail',
            ownedPaths: ['src/functions/onNewEmail.ts'],
        } :
        id.startsWith('sharepoint-connector-trigger-') ?
            {
                operationId: 'OnNewFile',
                functionName: 'OnNewFile',
                ownedPaths: ['src/functions/onNewFile.ts'],
            } :
            undefined;

    return {
        id,
        displayName,
        shortDescription: displayName,
        categories: ['connectors' as TemplateCategory],
        languages: [language],
        repositoryUrl: 'https://example.invalid/template',
        resource,
        connectorTrigger: operation ? { operations: [operation] } : undefined,
    } as IProjectTemplate;
}
