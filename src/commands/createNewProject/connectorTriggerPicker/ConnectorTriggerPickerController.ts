/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    callWithTelemetryAndErrorHandling,
    isUserCancelledError,
    parseError,
    type IActionContext,
    type IAzureQuickPickItem,
    type ISubscriptionContext,
} from '@microsoft/vscode-azext-utils';
import { WebviewController, type InitialTemplateFilters } from '@microsoft/vscode-azext-webview';
import * as vscode from 'vscode';
import {
    connectorTriggerProjectHandoffVersion,
    type ConnectorTriggerProjectHandoff,
} from '../../../connectorTrigger/connectorTriggerProjectHandoff';
import { type ConnectorTriggerOutputMetadata } from '../../../connectorTrigger/connectorTriggerOutputSchema';
import { getGenericConnectorTriggerTemplate } from '../../../connectorTrigger/genericConnectorTriggerTemplates';
import { type ProjectLanguage } from '../../../constants';
import { type IProjectTemplate } from '../../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../../templates/projectTemplates/ProjectTemplateProvider';
import {
    isConnectorTriggerPickerMessage,
    type ConnectorTriggerLocationOption,
    type ConnectorTriggerEventSupport,
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
    warning?: string;
}

export interface ConnectorTriggerProjectSelection {
    azureContext: ConnectorTriggerAzureContext;
    connector: ConnectorTriggerOption;
    operation: ConnectorTriggerOperationOption;
}

export type ConnectorTriggerCatalogLoader = (
    context: IActionContext,
    azureContext: ConnectorTriggerAzureContext,
) => Promise<ConnectorTriggerCatalogLoadResult>;

export type ConnectorTriggerSignIn = () => Promise<unknown>;
export type ConnectorTriggerCommandExecutor =
    (command: string) => Thenable<unknown>;

interface ConnectorOperationLoadResult {
    eventSupport: Exclude<ConnectorTriggerEventSupport, 'unknown'>;
    operations: ConnectorTriggerOperationOption[];
}

export class ConnectorTriggerPickerController extends WebviewController<ConnectorTriggerPickerViewModel> {
    private static currentController: ConnectorTriggerPickerController | undefined;
    private readonly catalogs = new Map<string, ConnectorTriggerCatalogLoadResult>();
    private readonly catalogLoadRequests = new Map<string, Promise<ConnectorTriggerCatalogLoadResult>>();
    private readonly connectorEventSupport =
        new Map<string, Exclude<ConnectorTriggerEventSupport, 'unknown'>>();
    private readonly operationLoadRequests =
        new Map<string, Promise<ConnectorOperationLoadResult | undefined>>();
    private readonly projectCreator: ProjectTemplateCreator;
    private readonly templateProvider = new ProjectTemplateProvider();
    private readonly locations = new Map<string, ConnectorTriggerLocationOption[]>();
    private azureContextRevision = 0;
    private catalogGeneration = 0;
    private azureContext: ConnectorTriggerAzureContext | undefined;
    private controllerDisposed = false;
    private signInPending = false;
    private subscriptionContext: ISubscriptionContext | undefined;

    private constructor(
        context: vscode.ExtensionContext,
        private readonly launchOptions: ConnectorTriggerPickerLaunchOptions,
        private readonly dataClient: ConnectorTriggerDataClient,
        private readonly catalogLoader: ConnectorTriggerCatalogLoader,
        private readonly signIn: ConnectorTriggerSignIn,
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
            void callWithTelemetryAndErrorHandling('azureFunctions.connectorTriggerPicker.authenticationChanged', async actionContext => {
                await this.handleAuthenticationChange(actionContext);
            });
        }));
        this.registerDisposable(this.onDisposed(() => {
            this.controllerDisposed = true;
            this.catalogGeneration += 1;
            this.operationLoadRequests.clear();
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
        signIn: ConnectorTriggerSignIn = signInToAzureResources,
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
            signIn,
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

        if (message.command === 'signIn') {
            await this.signInAndLoadSubscriptions(actionContext);
            return;
        }

        if (message.command === 'loadAllSubscriptions') {
            await this.loadSubscriptions(actionContext, false, true);
            return;
        }

        if (message.command === 'loadFilteredSubscriptions') {
            await this.loadSubscriptions(actionContext);
            return;
        }

        if (message.command === 'selectSubscription') {
            await this.selectSubscription(actionContext, message.subscriptionId);
            return;
        }

        if (message.command === 'selectRegion') {
            await this.selectRegion(
                actionContext,
                message.subscriptionId,
                message.region,
            );
            return;
        }

        if (message.command === 'loadCatalog') {
            if (this.azureContext) {
                await this.loadCatalog(actionContext, this.azureContext, true);
            } else {
                await this.postAzureContextRequired();
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

        if (message.command === 'loadConnectorOperations') {
            await this.loadConnectorOperations(
                actionContext,
                azureContext,
                message.connectorId,
            );
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
            await this.postWebhookCreationUnsupported();
            return;
        }

        actionContext.telemetry.properties.connectorSelected = 'true';
        actionContext.telemetry.properties.triggerSelected = 'true';
        actionContext.telemetry.properties.deliveryMode = 'Polling';
        await this.createSelectedProject(actionContext, {
            azureContext,
            connector,
            operation,
        });
    }

    private async initialize(actionContext: IActionContext): Promise<void> {
        this.resetAzureContext();
        await this.loadSubscriptions(actionContext, true);
    }

    private async handleAuthenticationChange(actionContext: IActionContext): Promise<void> {
        this.dataClient.invalidateSubscriptions();
        this.resetAzureContext();
        if (this.signInPending) {
            return;
        }

        await this.loadSubscriptions(actionContext, true);
    }

    private async signInAndLoadSubscriptions(actionContext: IActionContext): Promise<void> {
        try {
            this.signInPending = true;
            try {
                await this.signIn();
            } finally {
                this.signInPending = false;
            }
            await this.loadSubscriptions(actionContext);
        } catch (error) {
            if (isUserCancelledError(error)) {
                await this.postAzureContextRequired();
                return;
            }
            await this.postLoadFailed(actionContext, 'azureContext', error);
        }
    }

    private async loadSubscriptions(
        actionContext: IActionContext,
        showSignInWhenUnavailable = false,
        showingAll = false,
    ): Promise<void> {
        try {
            const subscriptions = await this.dataClient.listSubscriptions(showingAll);
            if (subscriptions.length === 0) {
                if (showSignInWhenUnavailable) {
                    await this.postAzureContextRequired();
                    return;
                }
                throw new Error(localize(
                    'connectorSubscriptionsUnavailable',
                    'No Azure subscriptions are available for Connector Triggers.',
                ));
            }
            if (this.azureContext &&
                !subscriptions.some(subscription =>
                    subscription.id === this.azureContext?.subscriptionId)) {
                this.resetAzureContext();
            }
            await this.postMessage({
                command: 'subscriptionsLoaded',
                subscriptions,
                showingAll,
            });
        } catch (error) {
            if (showSignInWhenUnavailable) {
                await this.postAzureContextRequired();
            } else {
                await this.postLoadFailed(actionContext, 'subscriptions', error);
            }
        }
    }

    private async selectSubscription(
        actionContext: IActionContext,
        subscriptionId: string,
    ): Promise<void> {
        this.resetAzureContext();
        const revision = this.azureContextRevision;
        try {
            const subscriptionContext =
                await this.dataClient.getSubscriptionContext(subscriptionId);
            const locations = await this.dataClient.listLocations(
                actionContext,
                subscriptionId,
            );
            if (revision !== this.azureContextRevision) {
                return;
            }
            if (locations.length === 0) {
                throw new Error(localize(
                    'connectorRegionsUnavailable',
                    'No Connector Trigger regions are available for the selected subscription.',
                ));
            }
            this.subscriptionContext = subscriptionContext;
            this.locations.set(subscriptionId, locations);
            await this.postMessage({
                command: 'locationsLoaded',
                subscriptionId,
                locations,
            });
        } catch (error) {
            await this.postLoadFailed(actionContext, 'locations', error);
        }
    }

    private async selectRegion(
        actionContext: IActionContext,
        subscriptionId: string,
        region: string,
    ): Promise<void> {
        const subscriptionContext = this.subscriptionContext;
        const location = this.locations.get(subscriptionId)?.find(
            item => equalsIgnoreCase(item.name, region),
        );
        if (!subscriptionContext ||
            subscriptionContext.subscriptionId !== subscriptionId ||
            !location) {
            await this.postLoadFailed(
                actionContext,
                'azureContext',
                new Error(localize(
                    'connectorAzureContextExpired',
                    'The selected Azure subscription or region is no longer available.',
                )),
            );
            return;
        }

        const azureContext: ConnectorTriggerAzureContext = {
            subscriptionId,
            subscriptionName: subscriptionContext.subscriptionDisplayName,
            region: location.name,
            regionDisplayName: location.label,
        };
        this.azureContext = azureContext;
        this.catalogGeneration += 1;
        this.catalogs.clear();
        this.catalogLoadRequests.clear();
        this.connectorEventSupport.clear();
        this.operationLoadRequests.clear();
        await this.postMessage({
            command: 'azureContextSelected',
            azureContext: getAzureContextDisplay(azureContext),
        });
        await this.loadCatalog(actionContext, azureContext);
    }

    private resetAzureContext(): void {
        this.azureContextRevision += 1;
        this.catalogGeneration += 1;
        this.azureContext = undefined;
        this.subscriptionContext = undefined;
        this.locations.clear();
        this.catalogs.clear();
        this.catalogLoadRequests.clear();
        this.connectorEventSupport.clear();
        this.operationLoadRequests.clear();
    }

    private async loadConnectorOperations(
        actionContext: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        connectorId: string,
        forceRefresh = false,
    ): Promise<void> {
        try {
            const result = await this.ensureConnectorOperations(
                actionContext,
                azureContext,
                connectorId,
                forceRefresh,
            );
            if (!result) {
                return;
            }
            await this.postMessage({
                command: 'connectorOperationsLoaded',
                connectorId,
                eventSupport: result.eventSupport,
                operations: result.operations.map(removeOperationInputs),
            });
        } catch (error) {
            if (!this.isCurrentCatalogContext(azureContext)) {
                return;
            }
            await this.postMessage({
                command: 'connectorOperationsFailed',
                connectorId,
                message: parseError(error).message,
            });
        }
    }

    private async ensureConnectorOperations(
        actionContext: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        connectorId: string,
        forceRefresh = false,
    ): Promise<ConnectorOperationLoadResult | undefined> {
        const catalogKey = getCatalogKey(azureContext);
        const requestKey = getConnectorRequestKey(catalogKey, connectorId);
        const catalog = this.catalogs.get(catalogKey)?.catalog;
        if (!catalog?.connectors.some(connector =>
            equalsIgnoreCase(connector.id, connectorId))) {
            throw new Error(localize(
                'connectorSelectionUnavailable',
                'The selected connector is no longer available.',
            ));
        }

        const existingSupport = this.connectorEventSupport.get(requestKey);
        if (!forceRefresh && existingSupport) {
            return {
                eventSupport: existingSupport,
                operations: catalog.operations.filter(operation =>
                    equalsIgnoreCase(operation.connectorId, connectorId)),
            };
        }

        const existingRequest = this.operationLoadRequests.get(requestKey);
        if (existingRequest) {
            return await existingRequest;
        }

        const generation = this.catalogGeneration;
        const request = this.fetchAndStoreConnectorOperations(
            actionContext,
            azureContext,
            catalog,
            connectorId,
            requestKey,
            generation,
        );
        this.operationLoadRequests.set(requestKey, request);
        try {
            return await request;
        } finally {
            if (this.operationLoadRequests.get(requestKey) === request) {
                this.operationLoadRequests.delete(requestKey);
            }
        }
    }

    private async fetchAndStoreConnectorOperations(
        actionContext: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        catalog: ConnectorTriggerCatalog,
        connectorId: string,
        requestKey: string,
        generation: number,
    ): Promise<ConnectorOperationLoadResult | undefined> {
        const metadata = await this.dataClient.listConnectorOperationMetadata(
            actionContext,
            azureContext,
            connectorId,
        );
        if (!this.isCurrentCatalog(
            azureContext,
            catalog,
            generation,
        )) {
            return undefined;
        }

        const eventSupport: Exclude<ConnectorTriggerEventSupport, 'unknown'> =
            metadata.pollOperations.length > 0 ?
                'poll' :
                metadata.webhookOperations.length > 0 ?
                    'webhook-only' :
                    'none';
        const operations = [
            ...metadata.pollOperations,
            ...metadata.webhookOperations,
        ];
        this.connectorEventSupport.set(requestKey, eventSupport);
        catalog.operations = [
            ...catalog.operations.filter(operation =>
                !equalsIgnoreCase(operation.connectorId, connectorId)),
            ...operations,
        ];
        catalog.connectors = catalog.connectors.map(connector =>
            equalsIgnoreCase(connector.id, connectorId) ?
                {
                    ...connector,
                    eventSupport,
                } :
                connector);
        return {
            eventSupport,
            operations,
        };
    }

    private isCurrentCatalog(
        azureContext: ConnectorTriggerAzureContext,
        catalog: ConnectorTriggerCatalog,
        generation: number,
    ): boolean {
        return generation === this.catalogGeneration &&
            this.isCurrentCatalogContext(azureContext) &&
            this.catalogs.get(getCatalogKey(azureContext))?.catalog === catalog;
    }

    private isCurrentCatalogContext(
        azureContext: ConnectorTriggerAzureContext,
    ): boolean {
        return !this.controllerDisposed &&
            this.azureContext === azureContext;
    }

    private async postAzureContextRequired(): Promise<void> {
        await this.postMessage({
            command: 'azureContextRequired',
            message: getAzureContextRequiredMessage(),
        });
    }

    private async postWebhookCreationUnsupported(): Promise<void> {
        await this.postMessage({
            command: 'projectCreationFailed',
            message: localize(
                'connectorTriggerWebhookCreationUnsupported',
                'Webhook Connector Triggers are not supported yet. Choose a polling event.',
            ),
        });
    }

    private async postLoadFailed(
        actionContext: IActionContext,
        scope: 'azureContext' | 'subscriptions' | 'locations' | 'catalog',
        error: unknown,
    ): Promise<void> {
        actionContext.telemetry.properties.connectorPickerLoad = scope;
        actionContext.telemetry.properties.result = 'Failed';
        await this.postMessage({
            command: 'loadFailed',
            scope,
            message: parseError(error).message,
        });
    }

    private async loadCatalog(
        actionContext: IActionContext,
        azureContext: ConnectorTriggerAzureContext,
        forceRefresh = false,
    ): Promise<void> {
        const catalogKey = getCatalogKey(azureContext);
        if (forceRefresh) {
            this.catalogGeneration += 1;
            this.connectorEventSupport.clear();
            this.operationLoadRequests.clear();
        }
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
            await this.postLoadFailed(actionContext, 'catalog', error);
        }
    }

    private async postCatalogLoaded(
        result: ConnectorTriggerCatalogLoadResult,
    ): Promise<void> {
        await this.postMessage({
            command: 'catalogLoaded',
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
        if (selection.operation.isWebhook) {
            await this.postWebhookCreationUnsupported();
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
            const handoff = createProjectHandoff(
                selection,
                subscriptionContext,
            );
            if (!this.launchOptions.isProjectWizard) {
                const outputMetadata =
                    await getConnectorOperationOutputMetadata(
                        this.dataClient,
                        actionContext,
                        selection,
                    );
                await this.projectCreator.addConnectorTrigger(
                    actionContext,
                    this.launchOptions.language,
                    projectPath,
                    handoff,
                    outputMetadata,
                );
                return;
            }

            const templates = await this.templateProvider.getTemplates(
                actionContext,
                this.launchOptions.language,
                this.launchOptions.languageModel,
            );
            const matchingTemplates = findConnectorProjectTemplates(
                templates,
                selection.connector,
            );
            const ownedTemplates = matchingTemplates.filter(template =>
                !!template.connectorTrigger);
            const materializableTemplates = ownedTemplates.filter(template =>
                template.connectorTrigger?.operations.some(operation =>
                    operation.operationId === selection.operation.id));
            const genericTemplate = getGenericConnectorTriggerTemplate(
                this.launchOptions.language,
            );
            let template: IProjectTemplate;
            let outputMetadata: ConnectorTriggerOutputMetadata | undefined;
            if (materializableTemplates.length === 0) {
                if (!genericTemplate) {
                    throw new Error(localize(
                        'connectorProjectTemplateUnavailable',
                        'No project template is currently available for event "{0}" in connector "{1}" and language "{2}".',
                        selection.operation.label,
                        selection.connector.label,
                        this.launchOptions.language,
                    ));
                }
                template = genericTemplate;
                outputMetadata =
                    await getConnectorOperationOutputMetadata(
                        this.dataClient,
                        actionContext,
                        selection,
                    );
            } else {
                template = materializableTemplates.length === 1 ?
                    materializableTemplates[0] :
                    await this.pickTemplate(actionContext, materializableTemplates);
            }
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
                    connectorTriggerHandoff: handoff,
                    ...(outputMetadata ?
                        { connectorTriggerOutputMetadata: outputMetadata } :
                        {}),
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

export async function signInToAzureResources(
    executeCommand: ConnectorTriggerCommandExecutor =
        vscode.commands.executeCommand,
): Promise<void> {
    await executeCommand('azureResourceGroups.logIn');
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

function getConnectorRequestKey(
    catalogKey: string,
    connectorId: string,
): string {
    return `${catalogKey}:${connectorId.toLowerCase()}`;
}

function getAzureContextDisplay(
    azureContext: ConnectorTriggerAzureContext,
): {
    subscriptionId: string;
    subscriptionName: string;
    region: string;
    regionDisplayName: string;
} {
    return {
        subscriptionId: azureContext.subscriptionId,
        subscriptionName: azureContext.subscriptionName,
        region: azureContext.region,
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

async function getConnectorOperationOutputMetadata(
    dataClient: ConnectorTriggerDataClient,
    actionContext: IActionContext,
    selection: ConnectorTriggerProjectSelection,
): Promise<ConnectorTriggerOutputMetadata> {
    try {
        const metadata =
            await dataClient.getConnectorOperationOutputMetadata(
                actionContext,
                selection.azureContext,
                selection.connector.id,
                selection.operation.id,
            );
        actionContext.telemetry.properties.connectorOutputSchema =
            metadata.schema ? 'typed' : metadata.limitation;
        return metadata;
    } catch {
        actionContext.telemetry.properties.connectorOutputSchema =
            'definition-unavailable';
        return { limitation: 'definition-unavailable' };
    }
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
    };
}

function createCatalogLoader(
    dataClient: ConnectorTriggerDataClient,
): ConnectorTriggerCatalogLoader {
    return async (context, azureContext) => {
        const result = await dataClient.getCatalog(context, azureContext);
        return {
            catalog: result.catalog,
        };
    };
}
