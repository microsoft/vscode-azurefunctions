/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseAzureResourceId } from '@microsoft/vscode-azext-azureutils';
import { callWithTelemetryAndErrorHandling, isUserCancelledError, nonNullProp, parseError, type IActionContext, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { WebviewController, type InitialTemplateFilters } from '@microsoft/vscode-azext-webview';
import * as vscode from 'vscode';
import { type ProjectLanguage } from '../../../constants';
import { type IProjectTemplate } from '../../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../../templates/projectTemplates/ProjectTemplateProvider';
import {
    isConnectorTriggerPickerMessage,
    type ConnectorNamespaceOption,
    type ConnectorTriggerCatalogSource,
    type ConnectorTriggerPickerResponse,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { localize } from '../../../localize';
import { createConnectorNamespace } from '../../createFunction/connectorSteps/createConnectorNamespace';
import { FunctionsTemplateGalleryController } from '../FunctionsTemplateGalleryController';
import { ProjectTemplateCreator } from '../ProjectTemplateCreator';
import { ConnectorTriggerDataClient, type ConnectorTriggerCatalog } from './ConnectorTriggerDataClient';
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

export type ConnectorTriggerCatalogLoader = (
    context: IActionContext,
    namespace?: ConnectorNamespaceOption,
) => Promise<ConnectorTriggerCatalogLoadResult>;

interface ConnectorTriggerCatalogProviderResult {
    catalog: ConnectorTriggerCatalog;
    source: 'remote' | 'remoteCache' | 'bundled' | 'live';
    liveRefresh: 'notRequested' | 'succeeded' | 'failed';
    errors: readonly unknown[];
}

interface ConnectorTriggerCatalogProviderClient {
    getCatalog(
        context: IActionContext,
        namespace?: ConnectorNamespaceOption,
    ): Promise<ConnectorTriggerCatalogProviderResult>;
}

export class ConnectorTriggerPickerController extends WebviewController<ConnectorTriggerPickerViewModel> {
    private static currentController: ConnectorTriggerPickerController | undefined;
    private readonly namespaces = new Map<string, ConnectorNamespaceOption>();
    private readonly catalogs = new Map<string, ConnectorTriggerCatalogLoadResult>();
    private readonly catalogLoadRequests = new Map<string, Promise<ConnectorTriggerCatalogLoadResult>>();
    private readonly projectCreator: ProjectTemplateCreator;
    private readonly templateProvider = new ProjectTemplateProvider();

    private constructor(
        context: vscode.ExtensionContext,
        private readonly launchOptions: ConnectorTriggerPickerLaunchOptions,
        private readonly dataClient: ConnectorTriggerDataClient,
        private readonly catalogLoader: ConnectorTriggerCatalogLoader,
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
            void callWithTelemetryAndErrorHandling('azureFunctions.connectorTriggerPicker.refreshCatalog', async actionContext => {
                await this.loadCatalog(actionContext, undefined, true);
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

        if (message.command === 'loadNamespaces') {
            await this.loadNamespaces(actionContext);
            return;
        }

        if (message.command === 'createNamespace') {
            await this.createNamespace(actionContext);
            return;
        }

        if (message.command === 'loadCatalog') {
            await this.loadCatalog(actionContext, message.namespaceId);
            return;
        }

        if (message.command === 'loadOperationInputs') {
            await this.loadOperationInputs(
                actionContext,
                message.namespaceId,
                message.connectorId,
                message.operationId,
            );
            return;
        }

        const catalog = this.catalogs.get(getCatalogKey(message.namespaceId))?.catalog;
        const connector = catalog?.connectors.find(item => item.id === message.connectorId);
        const operation = catalog?.operations.find(item =>
            item.id === message.operationId &&
            equalsIgnoreCase(item.connectorId, message.connectorId));
        if (!connector ||
            !operation ||
            connector.availability === 'unavailable' ||
            operation.availability === 'unavailable') {
            return;
        }

        if (message.deliveryMode !== 'Polling' || operation.isWebhook) {
            return;
        }

        actionContext.telemetry.properties.connectorSelected = 'true';
        actionContext.telemetry.properties.triggerSelected = 'true';
        actionContext.telemetry.properties.deliveryMode = message.deliveryMode;
        await this.createSelectedProject(actionContext, connector);
    }

    private async loadNamespaces(
        actionContext: IActionContext,
        selectedNamespaceId?: string,
        createdNamespace?: ConnectorNamespaceOption,
    ): Promise<void> {
        try {
            const result = await this.dataClient.listNamespaces(actionContext);
            const refreshedNamespaces = new Map(
                result.namespaces.map(namespace => [namespace.id, namespace]),
            );
            if (createdNamespace) {
                refreshedNamespaces.set(createdNamespace.id, createdNamespace);
            }

            this.namespaces.clear();
            for (const namespace of refreshedNamespaces.values()) {
                this.namespaces.set(namespace.id, namespace);
            }

            await this.postMessage({
                command: 'namespacesLoaded',
                namespaces: sortNamespaces([...this.namespaces.values()]),
                selectedNamespaceId,
                warning: result.failedSubscriptionCount > 0 ?
                    localize(
                        'connectorNamespacesPartialLoad',
                        'Connector Namespaces could not be loaded from {0} subscription(s).',
                        result.failedSubscriptionCount.toString(),
                    ) :
                    undefined,
            });
        } catch (error) {
            if (createdNamespace) {
                this.namespaces.set(createdNamespace.id, createdNamespace);
                actionContext.telemetry.properties.connectorNamespaceRefresh = 'Failed';
                await this.postMessage({
                    command: 'namespacesLoaded',
                    namespaces: sortNamespaces([...this.namespaces.values()]),
                    selectedNamespaceId: createdNamespace.id,
                    warning: localize(
                        'connectorNamespaceCreatedRefreshFailed',
                        'The Connector Namespace was created, but the namespace list could not be refreshed.',
                    ),
                });
                return;
            }

            actionContext.telemetry.properties.connectorPickerLoad = 'namespaces';
            actionContext.telemetry.properties.result = 'Failed';
            await this.postMessage({
                command: 'loadFailed',
                scope: 'namespaces',
                message: parseError(error).message,
            });
        }
    }

    private async loadCatalog(
        actionContext: IActionContext,
        namespaceId?: string,
        forceRefresh = false,
    ): Promise<void> {
        const namespace = namespaceId ? this.namespaces.get(namespaceId) : undefined;
        if (namespaceId && !namespace) {
            return;
        }

        const catalogKey = getCatalogKey(namespaceId);
        let request: Promise<ConnectorTriggerCatalogLoadResult> | undefined;
        try {
            const cachedResult = this.catalogs.get(catalogKey);
            if (cachedResult && !forceRefresh) {
                await this.postCatalogLoaded(namespaceId, cachedResult);
                return;
            }

            if (!forceRefresh && this.catalogLoadRequests.has(catalogKey)) {
                return;
            }

            request = this.catalogLoader(actionContext, namespace);
            this.catalogLoadRequests.set(catalogKey, request);
            const result = await request;
            if (this.catalogLoadRequests.get(catalogKey) !== request) {
                return;
            }

            this.catalogs.set(catalogKey, result);
            this.catalogLoadRequests.delete(catalogKey);
            await this.postCatalogLoaded(namespaceId, result);
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
                ...(namespaceId ? { namespaceId } : {}),
                message: parseError(error).message,
            });
        }
    }

    private async postCatalogLoaded(
        namespaceId: string | undefined,
        result: ConnectorTriggerCatalogLoadResult,
    ): Promise<void> {
        await this.postMessage({
            command: 'catalogLoaded',
            ...(namespaceId ? { namespaceId } : {}),
            source: result.source,
            connectors: result.catalog.connectors,
            operations: result.catalog.operations,
            warning: result.warning,
        });
    }

    private async createNamespace(actionContext: IActionContext): Promise<void> {
        try {
            const wizardContext = await createConnectorNamespace(actionContext);
            const resource = nonNullProp(wizardContext, 'connectorNamespace');
            const id = nonNullProp(resource, 'id');
            const name = nonNullProp(resource, 'name');
            this.dataClient.registerSubscription(wizardContext);
            const namespace: ConnectorNamespaceOption = {
                id,
                name,
                label: name,
                location: resource.location ?? '',
                resourceGroup: parseAzureResourceId(id).resourceGroup,
                subscriptionId: wizardContext.subscriptionId,
                subscriptionName: wizardContext.subscriptionDisplayName,
            };
            await this.loadNamespaces(actionContext, namespace.id, namespace);
        } catch (error) {
            if (isUserCancelledError(error)) {
                await this.postMessage({ command: 'namespaceCreationCancelled' });
                return;
            }

            actionContext.telemetry.properties.connectorNamespaceCreate = 'Failed';
            await this.postMessage({
                command: 'loadFailed',
                scope: 'namespaces',
                message: parseError(error).message,
            });
        }
    }

    private async loadOperationInputs(
        actionContext: IActionContext,
        namespaceId: string | undefined,
        connectorId: string,
        operationId: string,
    ): Promise<void> {
        const namespace = namespaceId ? this.namespaces.get(namespaceId) : undefined;
        const catalog = this.catalogs.get(getCatalogKey(namespaceId))?.catalog;
        const operation = catalog?.operations.find(item =>
            equalsIgnoreCase(item.connectorId, connectorId) &&
            equalsIgnoreCase(item.id, operationId));
        if (!catalog || !operation) {
            return;
        }

        if (operation.inputDefinitions !== undefined) {
            await this.postMessage({
                command: 'operationInputsLoaded',
                ...(namespaceId ? { namespaceId } : {}),
                connectorId,
                operationId,
                inputDefinitions: operation.inputDefinitions,
            });
            return;
        }

        if (!namespace) {
            return;
        }

        try {
            const inputDefinitions = await this.dataClient.listOperationInputs(
                actionContext,
                namespace,
                connectorId,
                operationId,
            );
            const updatedOperation = { ...operation, inputDefinitions };
            catalog.operations = catalog.operations.map(item =>
                item === operation ? updatedOperation : item);
            await this.postMessage({
                command: 'operationInputsLoaded',
                ...(namespaceId ? { namespaceId } : {}),
                connectorId,
                operationId,
                inputDefinitions,
            });
        } catch (error) {
            actionContext.telemetry.properties.connectorPickerLoad = 'operationInputs';
            actionContext.telemetry.properties.result = 'Failed';
            await this.postMessage({
                command: 'operationInputsFailed',
                ...(namespaceId ? { namespaceId } : {}),
                connectorId,
                operationId,
                message: parseError(error).message,
            });
        }
    }

    private async postMessage(message: ConnectorTriggerPickerResponse): Promise<void> {
        await this.panel.webview.postMessage(message);
    }

    private async createSelectedProject(
        actionContext: IActionContext,
        connector: ConnectorTriggerOption,
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

        await this.postMessage({ command: 'projectCreationStarted' });
        try {
            const templates = await this.templateProvider.getTemplates(
                actionContext,
                this.launchOptions.language,
                this.launchOptions.languageModel,
            );
            const matchingTemplates = findConnectorProjectTemplates(templates, connector);
            if (matchingTemplates.length === 0) {
                throw new Error(localize(
                    'connectorProjectTemplateUnavailable',
                    'No project template is currently available for connector "{0}" and language "{1}".',
                    connector.label,
                    this.launchOptions.language,
                ));
            }

            const template = matchingTemplates.length === 1 ?
                matchingTemplates[0] :
                await this.pickTemplate(actionContext, matchingTemplates);
            await this.projectCreator.createProject(
                actionContext,
                template,
                this.launchOptions.language,
                projectPath,
                'details',
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

function sortNamespaces(namespaces: ConnectorNamespaceOption[]): ConnectorNamespaceOption[] {
    return namespaces.sort((left, right) =>
        left.name.localeCompare(right.name) ||
        left.subscriptionName.localeCompare(right.subscriptionName));
}

function getCatalogKey(namespaceId: string | undefined): string {
    return namespaceId ?? '';
}

function createCatalogLoader(
    dataClient: ConnectorTriggerDataClient,
): ConnectorTriggerCatalogLoader {
    return async (context, namespace) => {
        if (hasCatalogProvider(dataClient)) {
            const result = await dataClient.getCatalog(context, namespace);
            return {
                catalog: result.catalog,
                source: result.source === 'remoteCache' ? 'remote' : result.source,
                warning: getCatalogWarning(result),
            };
        }

        if (namespace) {
            return {
                catalog: await dataClient.listCatalog(context, namespace),
                source: 'live',
            };
        }

        throw new Error(localize(
            'connectorCatalogProviderUnavailable',
            'The Microsoft connector catalog could not be loaded.',
        ));
    };
}

function hasCatalogProvider(
    dataClient: ConnectorTriggerDataClient,
): dataClient is ConnectorTriggerDataClient & ConnectorTriggerCatalogProviderClient {
    return typeof (dataClient as Partial<ConnectorTriggerCatalogProviderClient>).getCatalog === 'function';
}

function getCatalogWarning(
    result: ConnectorTriggerCatalogProviderResult,
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
