/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    callWithTelemetryAndErrorHandling, isUserCancelledError, parseError, UserCancelledError,
    type IActionContext, type IAzureQuickPickItem, type ISubscriptionContext,
} from '@microsoft/vscode-azext-utils';
import { WebviewController, type InitialTemplateFilters } from '@microsoft/vscode-azext-webview';
import * as vscode from 'vscode';
import { type ConnectorTriggerOutputMetadata } from '../../../connectorTrigger/connectorTriggerOutputSchema';
import { type ConnectorTriggerBatchSelection } from '../../../connectorTrigger/connectorTriggerSelection';
import { validateConnectorTriggerSelections } from '../../../connectorTrigger/ensureConnectorTriggerPollProject';
import { getGenericConnectorTriggerTemplate } from '../../../connectorTrigger/genericConnectorTriggerTemplates';
import { type ProjectLanguage } from '../../../constants';
import { localize } from '../../../localize';
import { type IProjectTemplate } from '../../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../../templates/projectTemplates/ProjectTemplateProvider';
import {
    isConnectorTriggerPickerMessage, type ConnectorTriggerLocationOption, type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption, type ConnectorTriggerPickerResponse, type ConnectorTriggerPickerViewModel,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { FunctionsTemplateGalleryController } from '../FunctionsTemplateGalleryController';
import { ProjectTemplateCreator, type ConnectorProjectCreationOptions } from '../ProjectTemplateCreator';
import { ConnectorTriggerDataClient, type ConnectorTriggerAzureContext, type ConnectorTriggerCatalog } from './ConnectorTriggerDataClient';
import { findConnectorProjectTemplates } from './connectorProjectTemplates';
import { getConnectorTriggerPickerBundleLocation } from './connectorTriggerPickerBundleLocation';
import { createConnectorTriggerPickerViewModel } from './createConnectorTriggerPickerViewModel';
import { allowWebviewImageSources, escapeWebviewInitialData } from './escapeWebviewInitialData';

export interface ConnectorTriggerPickerLaunchOptions {
    language: ProjectLanguage;
    languageModel?: number;
    initialLocation?: string;
    initialFilters: InitialTemplateFilters;
    /** .NET target framework selected in the project wizard, such as "net8.0". */
    targetFramework?: string;
}

export type ConnectorTriggerPickerDataSource = Pick<ConnectorTriggerDataClient,
    'listSubscriptions' | 'listLocations' | 'getSubscriptionContext' | 'getCatalog' |
    'listConnectorOperationMetadata' | 'getConnectorOperationOutputMetadata' | 'invalidateSubscriptions'>;

export class ConnectorTriggerPickerController extends WebviewController<ConnectorTriggerPickerViewModel> {
    private static currentController: ConnectorTriggerPickerController | undefined;
    private static testDataSource: ConnectorTriggerPickerDataSource | undefined;
    private readonly templateProvider = new ProjectTemplateProvider();
    private readonly projectCreator: ProjectTemplateCreator;
    private readonly operationRequests = new Map<string, Promise<void>>();
    private readonly loadedConnectors = new Set<string>();
    private catalog: ConnectorTriggerCatalog | undefined;
    private catalogRequest: Promise<void> | undefined;
    private catalogGeneration = 0;
    private azureContextRevision = 0;
    private azureContext: ConnectorTriggerAzureContext | undefined;
    private subscriptionContext: ISubscriptionContext | undefined;
    private locations: ConnectorTriggerLocationOption[] = [];
    private disposed = false;
    private signInPending = false;
    private projectCreationPending = false;
    private creationCancellation: vscode.CancellationTokenSource | undefined;

    private constructor(
        context: vscode.ExtensionContext,
        private readonly launchOptions: ConnectorTriggerPickerLaunchOptions,
        private readonly dataClient: ConnectorTriggerPickerDataSource,
        private readonly signIn: () => Promise<unknown>,
    ) {
        const viewModel = createConnectorTriggerPickerViewModel(launchOptions.initialFilters.language);
        super(context, viewModel.labels.panelTitle, 'connectorTriggerPicker', viewModel,
            vscode.ViewColumn.Active, undefined, getConnectorTriggerPickerBundleLocation(context));
        this.projectCreator = new ProjectTemplateCreator({
            onProjectCreated: () => { if (!this.disposed) { this.panel.dispose(); } },
            reportProgress: detail => { void this.postMessage({ command: 'projectCreationProgress', detail }); },
        });
        this.registerDisposable(this.panel.webview.onDidReceiveMessage(message => {
            void callWithTelemetryAndErrorHandling('azureFunctions.connectorTriggerPicker.handleMessage', async context => {
                await this.handleMessage(message, context);
            });
        }));
        this.registerDisposable(vscode.authentication.onDidChangeSessions(() => {
            void callWithTelemetryAndErrorHandling('azureFunctions.connectorTriggerPicker.authenticationChanged', async context => {
                this.dataClient.invalidateSubscriptions();
                this.resetAzureContext();
                if (!this.signInPending) {
                    await this.postAzureContextRequired();
                    await this.loadSubscriptions(context, true);
                }
            });
        }));
        this.registerDisposable(this.onDisposed(() => {
            this.disposed = true;
            this.creationCancellation?.cancel();
            this.creationCancellation?.dispose();
            this.catalogGeneration++;
            if (ConnectorTriggerPickerController.currentController === this) {
                ConnectorTriggerPickerController.currentController = undefined;
            }
        }));
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        options: ConnectorTriggerPickerLaunchOptions,
        dataClient: ConnectorTriggerPickerDataSource = this.testDataSource ?? new ConnectorTriggerDataClient(),
        signIn: () => Promise<unknown> = signInToAzureResources,
    ): ConnectorTriggerPickerController {
        const existing = this.currentController;
        if (existing && !existing.isDisposed) {
            existing.panel.dispose();
        }
        this.currentController = new ConnectorTriggerPickerController(context, options, dataClient, signIn);
        return this.currentController;
    }

    public static setTestDataSource(dataSource: ConnectorTriggerPickerDataSource | undefined): void {
        if (!process.env.VSCODE_RUNNING_TESTS) {
            throw new Error('Connector Trigger test overrides are unavailable.');
        }
        this.testDataSource = dataSource;
    }

    private async handleMessage(message: unknown, context: IActionContext): Promise<void> {
        if (this.projectCreationPending || this.disposed) {
            return;
        }
        if (!isConnectorTriggerPickerMessage(message)) {
            if (message && typeof message === 'object' && 'command' in message && message.command === 'continue') {
                context.telemetry.properties.connectorSelection = 'invalid';
                await this.postCreationFailed(localize('connectorTriggerSelectionInvalid', 'Select one or more distinct events for one connector.'));
            }
            return;
        }
        switch (message.command) {
            case 'browseTemplates':
                this.panel.dispose();
                FunctionsTemplateGalleryController.createOrShow(this.extensionContext, { initialLocation: this.launchOptions.initialLocation });
                return;
            case 'openCopilot':
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: localize('connectorTriggerCopilotPrompt', 'Help me build an Azure Functions connector trigger.'),
                    isPartialQuery: true, newSession: true,
                });
                return;
            case 'initialize':
                this.resetAzureContext();
                await this.loadSubscriptions(context, true);
                return;
            case 'signIn':
                await this.signInAndLoadSubscriptions(context);
                return;
            case 'loadAllSubscriptions':
            case 'loadFilteredSubscriptions':
                await this.loadSubscriptions(context, false, message.command === 'loadAllSubscriptions');
                return;
            case 'selectSubscription':
                await this.selectSubscription(context, message.subscriptionId);
                return;
            case 'selectRegion':
                await this.selectRegion(context, message.subscriptionId, message.region);
                return;
            case 'loadCatalog':
                if (this.azureContext) {
                    await this.loadCatalog(context, this.azureContext);
                } else {
                    await this.postAzureContextRequired();
                }
                return;
            case 'loadConnectorOperations':
                if (this.azureContext) {
                    const azureContext = this.azureContext;
                    const generation = this.catalogGeneration;
                    try {
                        await this.loadConnectorOperations(context, azureContext, message.connectorId);
                    } catch (error) {
                        if (this.isCurrentContext(azureContext, generation)) {
                            await this.postMessage({ command: 'connectorOperationsFailed', connectorId: message.connectorId, message: parseError(error).message });
                        }
                    }
                }
                return;
            case 'continue':
                this.projectCreationPending = true;
                this.creationCancellation = new vscode.CancellationTokenSource();
                try {
                    const selection: ConnectorTriggerBatchSelection = {
                        connectorId: message.connectorId,
                        operationIds: 'operationIds' in message ? message.operationIds : [message.operationId],
                    };
                    validateConnectorTriggerSelections(selection);
                    await this.createSelectedProject(context, selection, this.creationCancellation.token);
                } catch (error) {
                    context.telemetry.properties.result = isUserCancelledError(error) ? 'Canceled' : 'Failed';
                    if (this.disposed && !isUserCancelledError(error)) {
                        throw error;
                    }
                    await this.postCreationFailed(isUserCancelledError(error) ? '' : parseError(error).message);
                } finally {
                    this.creationCancellation?.dispose();
                    this.creationCancellation = undefined;
                    this.projectCreationPending = false;
                }
        }
    }

    private resetAzureContext(): void {
        this.azureContextRevision++;
        this.catalogGeneration++;
        this.creationCancellation?.cancel();
        this.azureContext = undefined;
        this.subscriptionContext = undefined;
        this.locations = [];
        this.catalog = undefined;
        this.catalogRequest = undefined;
        this.operationRequests.clear();
        this.loadedConnectors.clear();
    }

    private async signInAndLoadSubscriptions(context: IActionContext): Promise<void> {
        try {
            this.signInPending = true;
            try {
                await this.signIn();
            } finally {
                this.signInPending = false;
            }
            await this.loadSubscriptions(context);
        } catch (error) {
            if (isUserCancelledError(error)) {
                await this.postAzureContextRequired();
            } else {
                await this.postLoadFailed(context, 'azureContext', error);
            }
        }
    }

    private async loadSubscriptions(context: IActionContext, allowSignIn = false, showingAll = false): Promise<void> {
        const revision = this.azureContextRevision;
        try {
            const subscriptions = await this.dataClient.listSubscriptions(showingAll);
            if (revision !== this.azureContextRevision || this.disposed) {
                return;
            }
            if (subscriptions.length === 0) {
                await this.postAzureContextRequired();
            } else {
                await this.postMessage({ command: 'subscriptionsLoaded', subscriptions, showingAll });
            }
        } catch (error) {
            if (revision !== this.azureContextRevision || this.disposed) {
                return;
            }
            if (allowSignIn) {
                context.telemetry.properties.connectorPickerLoad = 'subscriptions';
                context.telemetry.properties.result = 'Failed';
                await this.postAzureContextRequired();
            } else {
                await this.postLoadFailed(context, 'subscriptions', error);
            }
        }
    }

    private async selectSubscription(context: IActionContext, subscriptionId: string): Promise<void> {
        this.resetAzureContext();
        const revision = this.azureContextRevision;
        try {
            const subscriptionContext = await this.dataClient.getSubscriptionContext(subscriptionId);
            const locations = await this.dataClient.listLocations(context, subscriptionId);
            if (revision !== this.azureContextRevision || this.disposed) {
                return;
            }
            if (locations.length === 0) {
                throw new Error(localize('connectorRegionsUnavailable', 'No Connector Trigger regions are available for the selected subscription.'));
            }
            this.subscriptionContext = subscriptionContext;
            this.locations = locations;
            await this.postMessage({ command: 'locationsLoaded', subscriptionId, locations });
        } catch (error) {
            if (revision === this.azureContextRevision) {
                await this.postLoadFailed(context, 'locations', error);
            }
        }
    }

    private async selectRegion(context: IActionContext, subscriptionId: string, region: string): Promise<void> {
        const subscription = this.subscriptionContext;
        const location = this.locations.find(item => equalsIgnoreCase(item.name, region));
        if (!subscription || subscription.subscriptionId !== subscriptionId || !location) {
            await this.postLoadFailed(context, 'azureContext', new Error(localize(
                'connectorAzureContextExpired', 'The selected Azure subscription or region is no longer available.',
            )));
            return;
        }
        const azureContext: ConnectorTriggerAzureContext = {
            subscriptionId, subscriptionName: subscription.subscriptionDisplayName,
            region: location.name, regionDisplayName: location.label,
        };
        this.azureContext = azureContext;
        await this.postMessage({ command: 'azureContextSelected', azureContext });
        if (this.azureContext === azureContext && !this.disposed) {
            await this.loadCatalog(context, azureContext);
        }
    }

    private async loadCatalog(context: IActionContext, azureContext: ConnectorTriggerAzureContext): Promise<void> {
        const generation = ++this.catalogGeneration;
        this.catalog = undefined;
        this.loadedConnectors.clear();
        this.operationRequests.clear();
        const request = (async () => {
            try {
                const result = await this.dataClient.getCatalog(context, azureContext);
                if (!this.isCurrentContext(azureContext, generation)) {
                    return;
                }
                this.catalog = result.catalog;
                await this.postMessage({ command: 'catalogLoaded', ...result.catalog });
            } catch (error) {
                if (this.isCurrentContext(azureContext, generation)) {
                    await this.postLoadFailed(context, 'catalog', error);
                }
            }
        })();
        this.catalogRequest = request;
        await request;
        if (this.catalogRequest === request) {
            this.catalogRequest = undefined;
        }
    }

    private async loadConnectorOperations(
        context: IActionContext, azureContext: ConnectorTriggerAzureContext, connectorId: string,
    ): Promise<void> {
        const generation = this.catalogGeneration;
        const catalog = this.catalog;
        const connector = catalog?.connectors.find(item => equalsIgnoreCase(item.id, connectorId));
        if (!catalog || !connector) {
            throw new Error(localize('connectorSelectionUnavailable', 'The selected connector is no longer available.'));
        }
        const key = connector.id.toLowerCase();
        if (!this.loadedConnectors.has(key)) {
            let request = this.operationRequests.get(key);
            if (!request) {
                request = (async () => {
                    const metadata = await this.dataClient.listConnectorOperationMetadata(context, azureContext, connector.id);
                    if (!this.isCurrentContext(azureContext, generation)) {
                        return;
                    }
                    const operations = [...metadata.pollOperations, ...metadata.webhookOperations];
                    connector.eventSupport = metadata.pollOperations.length > 0 ? 'poll' :
                        metadata.webhookOperations.length > 0 ? 'webhook-only' : 'none';
                    catalog.operations = [
                        ...catalog.operations.filter(operation => !equalsIgnoreCase(operation.connectorId, connector.id)),
                        ...operations,
                    ];
                    this.loadedConnectors.add(key);
                })();
                this.operationRequests.set(key, request);
            }
            try {
                await request;
            } finally {
                if (this.operationRequests.get(key) === request) {
                    this.operationRequests.delete(key);
                }
            }
        }
        if (this.isCurrentContext(azureContext, generation)) {
            await this.postMessage({
                command: 'connectorOperationsLoaded', connectorId: connector.id,
                eventSupport: connector.eventSupport === 'unknown' || !connector.eventSupport ? 'none' : connector.eventSupport,
                operations: catalog.operations.filter(operation => equalsIgnoreCase(operation.connectorId, connector.id)),
            });
        }
    }

    private isCurrentContext(azureContext: ConnectorTriggerAzureContext, generation: number): boolean {
        return !this.disposed && this.azureContext === azureContext && this.catalogGeneration === generation;
    }

    private async createSelectedProject(context: IActionContext, selection: ConnectorTriggerBatchSelection, token: vscode.CancellationToken): Promise<void> {
        const azureContext = this.azureContext;
        const generation = this.catalogGeneration;
        if (!azureContext || !this.subscriptionContext) {
            throw new Error(localize('connectorTriggerAzureContextMissing', 'Select an Azure subscription and region before creating the project.'));
        }
        const projectPath = this.launchOptions.initialLocation;
        if (!projectPath) {
            throw new Error(localize('connectorProjectLocationMissing', 'Select a project location before creating the connector project.'));
        }
        context.valuesToMask.push(projectPath, selection.connectorId, ...selection.operationIds);
        await this.catalogRequest;
        await this.loadConnectorOperations(context, azureContext, selection.connectorId);
        const connector = this.catalog?.connectors.find(item => equalsIgnoreCase(item.id, selection.connectorId));
        const operations = selection.operationIds.map(id => this.catalog?.operations.find(operation =>
            equalsIgnoreCase(operation.connectorId, selection.connectorId) && equalsIgnoreCase(operation.id, id)));
        if (!connector || connector.availability === 'unavailable' ||
            operations.some(operation => !operation || operation.availability === 'unavailable')) {
            throw new Error(localize('connectorTriggerSelectionUnavailableForCreation', 'The selected connector or events are no longer available. Refresh the catalog and choose again.'));
        }
        const selectedOperations = operations.filter((operation): operation is ConnectorTriggerOperationOption => !!operation);
        if (selectedOperations.some(operation => operation.isWebhook)) {
            throw new Error(localize('connectorTriggerWebhookCreationUnsupported', 'Webhook Connector Triggers are not supported yet. Choose polling events.'));
        }
        const normalizedSelection = { connectorId: connector.id, operationIds: selectedOperations.map(operation => operation.id) };
        context.telemetry.measurements.connectorEventCount = selectedOperations.length;
        context.telemetry.properties.deliveryMode = 'Polling';
        await this.postMessage({ command: 'projectCreationStarted' });
        const templates = findConnectorProjectTemplates(
            await this.templateProvider.getTemplates(context, this.launchOptions.language, this.launchOptions.languageModel), connector,
        ).filter(candidate => candidate.connectorTrigger?.operations.some(operation => normalizedSelection.operationIds.includes(operation.operationId)));
        const coverage = (candidate: IProjectTemplate): number => candidate.connectorTrigger?.operations.filter(
            operation => normalizedSelection.operationIds.includes(operation.operationId)).length ?? 0;
        templates.sort((left, right) => coverage(right) - coverage(left));
        const preferred = templates.filter(candidate => coverage(candidate) === coverage(templates[0]));
        const template = preferred.length === 1 ? preferred[0] :
            preferred.length > 1 ? await this.pickTemplate(context, preferred) :
                getGenericConnectorTriggerTemplate(this.launchOptions.language);
        if (!template) {
            throw new Error(localize('connectorProjectTemplateUnavailable', 'No project template is available for the selected Connector Trigger events and language.'));
        }
        const outputMetadata = new Map<string, ConnectorTriggerOutputMetadata>();
        for (const operation of selectedOperations) {
            if (!template.connectorTrigger?.operations.some(owned => owned.operationId === operation.id)) {
                outputMetadata.set(operation.id, await this.getOutputMetadata(context, azureContext, connector, operation));
            }
        }
        if (!this.isCurrentContext(azureContext, generation) || token.isCancellationRequested) {
            throw new UserCancelledError('connectorSelectionChanged');
        }
        const options: ConnectorProjectCreationOptions = {
            selection: normalizedSelection, outputMetadata, cancellationToken: token,
            targetFramework: this.launchOptions.targetFramework,
        };
        await this.projectCreator.createProject(context, template, this.launchOptions.language, projectPath, options);
    }

    private async getOutputMetadata(
        context: IActionContext, azureContext: ConnectorTriggerAzureContext,
        connector: ConnectorTriggerOption, operation: ConnectorTriggerOperationOption,
    ): Promise<ConnectorTriggerOutputMetadata> {
        try {
            const metadata = await this.dataClient.getConnectorOperationOutputMetadata(context, azureContext, connector.id, operation.id);
            context.telemetry.properties.connectorOutputSchema = metadata.schema ? 'typed' : metadata.limitation;
            return metadata;
        } catch {
            context.telemetry.properties.connectorOutputSchema = 'definition-unavailable';
            return { limitation: 'definition-unavailable' };
        }
    }

    private async pickTemplate(context: IActionContext, templates: IProjectTemplate[]): Promise<IProjectTemplate> {
        const picks: IAzureQuickPickItem<IProjectTemplate>[] = templates.map(template => ({
            label: template.displayName, description: template.shortDescription, data: template,
        }));
        return (await context.ui.showQuickPick(picks, {
            placeHolder: localize('selectConnectorProjectTemplate', 'Select a connector project template'),
        })).data;
    }

    private async postAzureContextRequired(): Promise<void> {
        await this.postMessage({ command: 'azureContextRequired', message: createConnectorTriggerPickerViewModel().labels.azureContextRequired });
    }

    private async postCreationFailed(message: string): Promise<void> {
        await this.postMessage({ command: 'projectCreationFailed', message });
    }

    private async postLoadFailed(
        context: IActionContext, scope: 'azureContext' | 'subscriptions' | 'locations' | 'catalog', error: unknown,
    ): Promise<void> {
        context.telemetry.properties.connectorPickerLoad = scope;
        context.telemetry.properties.result = 'Failed';
        await this.postMessage({ command: 'loadFailed', scope, message: parseError(error).message });
    }

    private async postMessage(message: ConnectorTriggerPickerResponse): Promise<void> {
        if (!this.disposed) {
            await this.panel.webview.postMessage(message);
        }
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        return allowWebviewImageSources(escapeWebviewInitialData(super.getDocumentTemplate(webview)), ['https:']);
    }
}

export async function signInToAzureResources(
    executeCommand: (command: string) => Thenable<unknown> = vscode.commands.executeCommand,
): Promise<void> {
    await executeCommand('azureResourceGroups.logIn');
}

function equalsIgnoreCase(left: string, right: string): boolean {
    return left.toLowerCase() === right.toLowerCase();
}
