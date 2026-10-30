/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep, type ILocationWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, callWithTelemetryAndErrorHandling, createSubscriptionContext, isUserCancelledError, nonNullProp, parseError, subscriptionExperience, type AzureWizardPromptStep, type IActionContext, type IAzureQuickPickItem, type ISubscriptionActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController, type InitialTemplateFilters } from '@microsoft/vscode-azext-webview';
import * as vscode from 'vscode';
import {
    connectorTriggerProjectHandoffVersion,
    type ConnectorTriggerProjectHandoff,
} from '../../../connectorTrigger/connectorTriggerProjectHandoff';
import { ConnectorNamespaceResourceType, type ProjectLanguage, webProvider } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { type IProjectTemplate } from '../../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../../templates/projectTemplates/ProjectTemplateProvider';
import {
    isConnectorTriggerPickerMessage,
    type ConnectorTriggerCatalogSource,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerPickerResponse,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { localize } from '../../../localize';
import { FunctionsTemplateGalleryController } from '../FunctionsTemplateGalleryController';
import { ProjectTemplateCreator } from '../ProjectTemplateCreator';
import {
    ConnectorTriggerDataClient,
    type ConnectorTriggerAzureContext,
    type ConnectorTriggerCatalog,
    type ConnectorTriggerCatalogResult,
} from './ConnectorTriggerDataClient';
import { getConnectorTriggerPickerBundleLocation } from './connectorTriggerPickerBundleLocation';
import { findConnectorProjectTemplates } from './connectorProjectTemplates';
import { createConnectorTriggerPickerViewModel } from './createConnectorTriggerPickerViewModel';
import { allowWebviewImageSources, escapeWebviewInitialData } from './escapeWebviewInitialData';

export interface ConnectorTriggerPickerLaunchOptions {
    isProjectWizard: boolean;
    language: ProjectLanguage;
    languageModel?: number;
    initialLocation?: string;
    initialFilters: InitialTemplateFilters;
}

export interface ConnectorTriggerCatalogLoadResult {
    catalog: ConnectorTriggerCatalog;
    source: ConnectorTriggerCatalogSource;
    warning?: string;
}

export interface ConnectorTriggerProjectSelection {
    azureContext: ConnectorTriggerAzureContext;
    catalogSource: ConnectorTriggerCatalogSource;
    connector: ConnectorTriggerOption;
    operation: ConnectorTriggerOperationOption;
}

export interface ConnectorTriggerAzureContextSelection {
    azureContext: ConnectorTriggerAzureContext;
    subscriptionContext: ISubscriptionContext;
}

export type ConnectorTriggerAzureContextProvider = (
    context: IActionContext,
) => Promise<ConnectorTriggerAzureContextSelection>;

export type ConnectorTriggerCatalogLoader = (
    context: IActionContext,
    azureContext: ConnectorTriggerAzureContext,
) => Promise<ConnectorTriggerCatalogLoadResult>;

export class ConnectorTriggerPickerController extends WebviewController<ConnectorTriggerPickerViewModel> {
    private static currentController: ConnectorTriggerPickerController | undefined;
    private readonly catalogs = new Map<string, ConnectorTriggerCatalogLoadResult>();
    private readonly catalogLoadRequests = new Map<string, Promise<ConnectorTriggerCatalogLoadResult>>();
    private readonly projectCreator: ProjectTemplateCreator;
    private readonly templateProvider = new ProjectTemplateProvider();
    private azureContext: ConnectorTriggerAzureContext | undefined;
    private azureContextRequest: Promise<void> | undefined;
    private azureContextSelectionPending = false;
    private subscriptionContext: ISubscriptionContext | undefined;

    private constructor(
        context: vscode.ExtensionContext,
        private readonly launchOptions: ConnectorTriggerPickerLaunchOptions,
        private readonly dataClient: ConnectorTriggerDataClient,
        private readonly catalogLoader: ConnectorTriggerCatalogLoader,
        private readonly azureContextProvider: ConnectorTriggerAzureContextProvider,
    ) {
        const viewModel = createConnectorTriggerPickerViewModel(
            launchOptions.initialFilters.language,
        );
        super(
            context,
            viewModel.labels.panelTitle,
            'connectorTriggerPicker',
            viewModel,
            vscode.ViewColumn.Active,
            undefined,
            getConnectorTriggerPickerBundleLocation(context),
        );

        this.registerDisposable(this.panel.webview.onDidReceiveMessage(message => {
            void callWithTelemetryAndErrorHandling('azureFunctions.connectorTriggerPicker.handleMessage', async actionContext => {
                await this.handleMessage(message, actionContext);
            });
        }));
        this.registerDisposable(vscode.authentication.onDidChangeSessions(() => {
            void callWithTelemetryAndErrorHandling('azureFunctions.connectorTriggerPicker.authenticationChanged', async () => {
                await this.handleAuthenticationChange();
            });
        }));
        this.registerDisposable(this.onDisposed(() => {
            if (ConnectorTriggerPickerController.currentController === this) {
                ConnectorTriggerPickerController.currentController = undefined;
            }
        }));
        this.projectCreator = new ProjectTemplateCreator({
            onProjectCreated: () => this.panel.dispose(),
            reportProgress: detail => {
                void this.postMessage({
                    command: 'projectCreationProgress',
                    detail,
                });
            },
        });
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        launchOptions: ConnectorTriggerPickerLaunchOptions,
        dataClient: ConnectorTriggerDataClient = new ConnectorTriggerDataClient(),
        catalogLoader: ConnectorTriggerCatalogLoader = createCatalogLoader(dataClient),
        azureContextProvider: ConnectorTriggerAzureContextProvider =
            selectConnectorTriggerAzureContext,
    ): ConnectorTriggerPickerController {
        const existing = ConnectorTriggerPickerController.currentController;
        if (existing && !existing.isDisposed) {
            existing.panel.dispose();
        }

        const controller = new ConnectorTriggerPickerController(
            context,
            launchOptions,
            dataClient,
            catalogLoader,
            azureContextProvider,
        );
        ConnectorTriggerPickerController.currentController = controller;
        return controller;
    }

    private async handleMessage(message: unknown, actionContext: IActionContext): Promise<void> {
        if (!isConnectorTriggerPickerMessage(message)) {
            return;
        }

        if (message.command === 'browseTemplates') {
            this.panel.dispose();
            FunctionsTemplateGalleryController.createOrShow(this.extensionContext, {
                initialLocation: this.launchOptions.initialLocation,
            });
            return;
        }

        if (message.command === 'openCopilot') {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: localize(
                    'connectorTriggerCopilotPrompt',
                    'Help me build an Azure Functions connector trigger.',
                ),
                isPartialQuery: true,
                newSession: true,
            });
            return;
        }

        if (message.command === 'initialize') {
            await this.initialize(actionContext);
            return;
        }

        if (message.command === 'loadCatalog') {
            if (this.azureContext) {
                await this.loadCatalog(actionContext, this.azureContext, true);
            } else {
                await this.initialize(actionContext);
            }
            return;
        }

        const azureContext = this.azureContext;
        if (!azureContext) {
            await this.postMessage({
                command: 'projectCreationFailed',
                message: localize(
                    'connectorTriggerAzureContextMissing',
                    'Select an Azure subscription and region before creating the project.',
                ),
            });
            return;
        }

        const catalogKey = getCatalogKey(azureContext);
        const pendingCatalog = this.catalogLoadRequests.get(catalogKey);
        if (pendingCatalog) {
            try {
                await pendingCatalog;
            } catch {
                // The catalog load reports its own error; continue so project creation
                // can clear its busy state with an unavailable-selection response.
            }
        }

        const catalogResult = this.catalogs.get(catalogKey);
        const catalog = catalogResult?.catalog;
        const connector = catalog?.connectors.find(item => item.id === message.connectorId);
        const operation = catalog?.operations.find(item =>
            item.id === message.operationId &&
            equalsIgnoreCase(item.connectorId, message.connectorId));
        if (!catalogResult ||
            !connector ||
            !operation ||
            connector.availability === 'unavailable' ||
            operation.availability === 'unavailable') {
            await this.postMessage({
                command: 'projectCreationFailed',
                message: localize(
                    'connectorTriggerSelectionUnavailableForCreation',
                    'The selected connector or event is no longer available. Choose another selection.',
                ),
            });
            return;
        }

        if (operation.isWebhook) {
            await this.postMessage({
                command: 'projectCreationFailed',
                message: localize(
                    'connectorTriggerDeliveryUnavailableForCreation',
                    'The selected delivery mode is not available.',
                ),
            });
            return;
        }

        actionContext.telemetry.properties.connectorSelected = 'true';
        actionContext.telemetry.properties.triggerSelected = 'true';
        actionContext.telemetry.properties.deliveryMode = 'Polling';
        await this.createSelectedProject(actionContext, {
            azureContext,
            catalogSource: catalogResult.source,
            connector,
            operation,
        });
    }

    private async initialize(actionContext: IActionContext): Promise<void> {
        if (this.azureContext) {
            await this.postMessage({
                command: 'azureContextSelected',
                azureContext: getAzureContextDisplay(this.azureContext),
            });
            await this.loadCatalog(actionContext, this.azureContext);
            return;
        }

        if (this.azureContextRequest) {
            await this.azureContextRequest;
            return;
        }

        const request = this.selectAzureContext(actionContext);
        this.azureContextRequest = request;
        try {
            await request;
        } finally {
            if (this.azureContextRequest === request) {
                this.azureContextRequest = undefined;
            }
        }
    }

    private async handleAuthenticationChange(): Promise<void> {
        this.dataClient.invalidateSubscriptions();
        if (this.azureContextSelectionPending) {
            return;
        }

        this.azureContext = undefined;
        this.subscriptionContext = undefined;
        this.catalogs.clear();
        this.catalogLoadRequests.clear();
        await this.postMessage({
            command: 'azureContextSelectionCancelled',
            message: getAzureContextRequiredMessage(),
        });
    }

    private async selectAzureContext(actionContext: IActionContext): Promise<void> {
        try {
            this.azureContextSelectionPending = true;
            let selection: ConnectorTriggerAzureContextSelection;
            try {
                selection = await this.azureContextProvider(actionContext);
                this.dataClient.registerSubscription(selection.subscriptionContext);
                this.azureContext = selection.azureContext;
                this.subscriptionContext = selection.subscriptionContext;
                this.catalogs.clear();
                this.catalogLoadRequests.clear();
                await this.postMessage({
                    command: 'azureContextSelected',
                    azureContext: getAzureContextDisplay(selection.azureContext),
                });
            } finally {
                this.azureContextSelectionPending = false;
            }
            await this.loadCatalog(actionContext, selection.azureContext);
        } catch (error) {
            if (isUserCancelledError(error)) {
                await this.postMessage({
                    command: 'azureContextSelectionCancelled',
                    message: getAzureContextRequiredMessage(),
                });
                return;
            }

            actionContext.telemetry.properties.connectorPickerLoad = 'azureContext';
            actionContext.telemetry.properties.result = 'Failed';
            await this.postMessage({
                command: 'loadFailed',
                scope: 'azureContext',
                message: parseError(error).message,
            });
        }
    }

    private async loadCatalog(
        actionContext: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        forceRefresh = false,
    ): Promise<void> {
        const catalogKey = getCatalogKey(azureContext);
        let request: Promise<ConnectorTriggerCatalogLoadResult> | undefined;
        try {
            const cachedResult = this.catalogs.get(catalogKey);
            if (cachedResult && !forceRefresh) {
                await this.postCatalogLoaded(cachedResult);
                return;
            }

            if (!forceRefresh && this.catalogLoadRequests.has(catalogKey)) {
                return;
            }

            request = this.catalogLoader(actionContext, azureContext);
            this.catalogLoadRequests.set(catalogKey, request);
            const result = await request;
            if (this.catalogLoadRequests.get(catalogKey) !== request) {
                return;
            }

            this.catalogs.set(catalogKey, result);
            this.catalogLoadRequests.delete(catalogKey);
            await this.postCatalogLoaded(result);
        } catch (error) {
            if (request && this.catalogLoadRequests.get(catalogKey) !== request) {
                return;
            }
            this.catalogLoadRequests.delete(catalogKey);
            actionContext.telemetry.properties.connectorPickerLoad = 'catalog';
            actionContext.telemetry.properties.result = 'Failed';
            await this.postMessage({
                command: 'loadFailed',
                scope: 'catalog',
                message: parseError(error).message,
            });
        }
    }

    private async postCatalogLoaded(
        result: ConnectorTriggerCatalogLoadResult,
    ): Promise<void> {
        await this.postMessage({
            command: 'catalogLoaded',
            source: result.source,
            connectors: result.catalog.connectors,
            operations: result.catalog.operations.map(removeOperationInputs),
            ...(result.warning ? { warning: result.warning } : {}),
        });
    }

    private async postMessage(message: ConnectorTriggerPickerResponse): Promise<void> {
        await this.panel.webview.postMessage(message);
    }

    private async createSelectedProject(
        actionContext: IActionContext,
        selection: ConnectorTriggerProjectSelection,
    ): Promise<void> {
        if (!this.launchOptions.isProjectWizard) {
            await this.postMessage({
                command: 'projectCreationFailed',
                message: localize(
                    'connectorExistingProjectCreationUnsupported',
                    'Adding a connector trigger to an existing project is not supported yet.',
                ),
            });
            return;
        }

        const projectPath = this.launchOptions.initialLocation;
        if (!projectPath) {
            await this.postMessage({
                command: 'projectCreationFailed',
                message: localize(
                    'connectorProjectLocationMissing',
                    'Select a project location before creating the connector project.',
                ),
            });
            return;
        }

        const subscriptionContext = this.subscriptionContext;
        if (!subscriptionContext ||
            subscriptionContext.subscriptionId !== selection.azureContext.subscriptionId) {
            await this.postMessage({
                command: 'projectCreationFailed',
                message: localize(
                    'connectorTriggerAzureContextExpired',
                    'The selected Azure context is no longer available. Select the Connector Trigger again.',
                ),
            });
            return;
        }

        await this.postMessage({ command: 'projectCreationStarted' });
        try {
            const templates = await this.templateProvider.getTemplates(
                actionContext,
                this.launchOptions.language,
                this.launchOptions.languageModel,
            );
            const matchingTemplates = findConnectorProjectTemplates(
                templates,
                selection.connector,
            );
            if (matchingTemplates.length === 0) {
                throw new Error(localize(
                    'connectorProjectTemplateUnavailable',
                    'No project template is currently available for connector "{0}" and language "{1}".',
                    selection.connector.label,
                    this.launchOptions.language,
                ));
            }

            const template = matchingTemplates.length === 1 ?
                matchingTemplates[0] :
                await this.pickTemplate(actionContext, matchingTemplates);
            if (this.azureContext !== selection.azureContext ||
                this.subscriptionContext !== subscriptionContext) {
                throw new Error(localize(
                    'connectorTriggerAzureContextExpired',
                    'The selected Azure context is no longer available. Select the Connector Trigger again.',
                ));
            }
            await this.projectCreator.createProject(
                actionContext,
                template,
                this.launchOptions.language,
                projectPath,
                'details',
                {
                    connectorTriggerHandoff: createProjectHandoff(
                        selection,
                        subscriptionContext,
                    ),
                },
            );
        } catch (error) {
            await this.postMessage({
                command: 'projectCreationFailed',
                message: isUserCancelledError(error) ? '' : parseError(error).message,
            });
        }
    }

    private async pickTemplate(
        actionContext: IActionContext,
        templates: IProjectTemplate[],
    ): Promise<IProjectTemplate> {
        const picks: IAzureQuickPickItem<IProjectTemplate>[] = templates.map(template => ({
            label: template.displayName,
            description: template.shortDescription,
            data: template,
        }));
        return (await actionContext.ui.showQuickPick(picks, {
            placeHolder: localize(
                'selectConnectorProjectTemplate',
                'Select a connector project template',
            ),
        })).data;
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        return allowWebviewImageSources(
            escapeWebviewInitialData(super.getDocumentTemplate(webview)),
            ['https:'],
        );
    }
}

function equalsIgnoreCase(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function getAzureContextRequiredMessage(): string {
    return localize(
        'connectorTriggerAzureContextRequired',
        'Azure sign-in, a subscription, and a region are required before you can browse Connector Triggers.',
    );
}

function getCatalogKey(azureContext: ConnectorTriggerAzureContext): string {
    return `${azureContext.subscriptionId}:${azureContext.region.replace(/\s+/g, '').toLowerCase()}`;
}

function getAzureContextDisplay(
    azureContext: ConnectorTriggerAzureContext,
): { subscriptionName: string; regionDisplayName: string } {
    return {
        subscriptionName: azureContext.subscriptionName,
        regionDisplayName: azureContext.regionDisplayName,
    };
}

function removeOperationInputs(
    operation: ConnectorTriggerOperationOption,
): ConnectorTriggerOperationOption {
    const pickerOperation = { ...operation };
    delete pickerOperation.inputDefinitions;
    return pickerOperation;
}

function createProjectHandoff(
    selection: ConnectorTriggerProjectSelection,
    subscriptionContext: ISubscriptionContext,
): ConnectorTriggerProjectHandoff {
    return {
        version: connectorTriggerProjectHandoffVersion,
        subscription: {
            id: subscriptionContext.subscriptionId,
            tenantId: subscriptionContext.tenantId,
            environment: {
                name: subscriptionContext.environment.name,
                resourceManagerEndpointUrl:
                    subscriptionContext.environment.resourceManagerEndpointUrl,
            },
        },
        region: selection.azureContext.region,
        connectorId: selection.connector.id,
        operationId: selection.operation.id,
        catalog: {
            source: selection.catalogSource,
        },
    };
}

function createCatalogLoader(
    dataClient: ConnectorTriggerDataClient,
): ConnectorTriggerCatalogLoader {
    return async (context, azureContext) => {
        const result = await dataClient.getCatalog(context, azureContext);
        return {
            catalog: result.catalog,
            source: result.source === 'remoteCache' ? 'remote' : result.source,
            warning: getCatalogWarning(result),
        };
    };
}

function getCatalogWarning(
    result: ConnectorTriggerCatalogResult,
): string | undefined {
    if (result.liveRefresh === 'failed') {
        return localize(
            'connectorCatalogLiveRefreshFailed',
            'Live Azure availability could not be refreshed. Showing the Microsoft connector catalog without live availability.',
        );
    }

    if (result.source === 'bundled' && result.errors.length > 0) {
        return localize(
            'connectorCatalogRemoteLoadFailed',
            'The Microsoft connector catalog could not be refreshed. Showing the bundled catalog snapshot.',
        );
    }

    return undefined;
}

interface ConnectorTriggerAzureContextWizardContext extends
    ISubscriptionActionContext,
    ILocationWizardContext { }

export async function selectConnectorTriggerAzureContext(
    context: IActionContext,
): Promise<ConnectorTriggerAzureContextSelection> {
    const subscriptionContext = createSubscriptionContext(
        await subscriptionExperience(
            context,
            ext.rgApiV2.resources.azureResourceTreeDataProvider,
        ),
    );
    const wizardContext: ConnectorTriggerAzureContextWizardContext = {
        ...context,
        ...subscriptionContext,
    };
    const promptSteps: AzureWizardPromptStep<ConnectorTriggerAzureContextWizardContext>[] = [];
    LocationListStep.addProviderForFiltering(
        wizardContext,
        webProvider,
        ConnectorNamespaceResourceType,
    );
    LocationListStep.addStep(wizardContext, promptSteps, {
        placeHolder: localize(
            'selectConnectorTriggerRegion',
            'Select a region for Connector Trigger resources',
        ),
    });

    const wizard = new AzureWizard(wizardContext, {
        title: localize(
            'selectConnectorTriggerAzureContext',
            'Select Connector Trigger Azure Context',
        ),
        promptSteps,
        showLoadingPrompt: true,
        hideStepCount: true,
    });
    await wizard.prompt();
    const location = await LocationListStep.getLocation(wizardContext, webProvider);
    const locationName = nonNullProp(location, 'name');
    return {
        azureContext: {
            subscriptionId: subscriptionContext.subscriptionId,
            subscriptionName: subscriptionContext.subscriptionDisplayName,
            region: locationName,
            regionDisplayName: location.displayName,
        },
        subscriptionContext,
    };
}
