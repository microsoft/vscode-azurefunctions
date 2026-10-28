/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController, type InitialTemplateFilters } from '@microsoft/vscode-azext-webview';
import * as vscode from 'vscode';
import {
    isConnectorTriggerPickerMessage,
    type ConnectorNamespaceOption,
    type ConnectorTriggerPickerResponse,
    type ConnectorTriggerPickerViewModel,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { localize } from '../../../localize';
import { FunctionsTemplateGalleryController } from '../FunctionsTemplateGalleryController';
import { ConnectorTriggerDataClient, type ConnectorTriggerCatalog } from './ConnectorTriggerDataClient';
import { getConnectorTriggerPickerBundleLocation } from './connectorTriggerPickerBundleLocation';
import { createConnectorTriggerPickerViewModel } from './createConnectorTriggerPickerViewModel';
import { allowWebviewImageSources, escapeWebviewInitialData } from './escapeWebviewInitialData';

export interface ConnectorTriggerPickerLaunchOptions {
    initialLocation?: string;
    initialFilters: InitialTemplateFilters;
}

export class ConnectorTriggerPickerController extends WebviewController<ConnectorTriggerPickerViewModel> {
    private static currentController: ConnectorTriggerPickerController | undefined;
    private readonly namespaces = new Map<string, ConnectorNamespaceOption>();
    private readonly catalogs = new Map<string, ConnectorTriggerCatalog>();

    private constructor(
        context: vscode.ExtensionContext,
        private readonly launchOptions: ConnectorTriggerPickerLaunchOptions,
        private readonly dataClient: ConnectorTriggerDataClient,
    ) {
        const viewModel = createConnectorTriggerPickerViewModel();
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
        this.registerDisposable(this.onDisposed(() => {
            if (ConnectorTriggerPickerController.currentController === this) {
                ConnectorTriggerPickerController.currentController = undefined;
            }
        }));
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        launchOptions: ConnectorTriggerPickerLaunchOptions,
        dataClient: ConnectorTriggerDataClient = new ConnectorTriggerDataClient(),
    ): ConnectorTriggerPickerController {
        const existing = ConnectorTriggerPickerController.currentController;
        if (existing && !existing.isDisposed) {
            existing.panel.dispose();
        }

        const controller = new ConnectorTriggerPickerController(context, launchOptions, dataClient);
        ConnectorTriggerPickerController.currentController = controller;
        return controller;
    }

    private async handleMessage(message: unknown, actionContext: IActionContext): Promise<void> {
        if (!isConnectorTriggerPickerMessage(message)) {
            return;
        }

        if (message.command === 'close') {
            this.panel.dispose();
            return;
        }

        if (message.command === 'loadNamespaces') {
            await this.loadNamespaces(actionContext);
            return;
        }

        if (message.command === 'loadCatalog') {
            await this.loadCatalog(actionContext, message.namespaceId);
            return;
        }

        const namespace = this.namespaces.get(message.namespaceId);
        const catalog = this.catalogs.get(message.namespaceId);
        const connector = catalog?.connectors.find(item => item.id === message.connectorId);
        const operation = catalog?.operations.find(item =>
            item.id === message.operationId &&
            equalsIgnoreCase(item.connectorId, message.connectorId));
        if (!namespace || !connector || !operation) {
            return;
        }

        actionContext.telemetry.properties.connectorSelected = 'true';
        actionContext.telemetry.properties.triggerSelected = 'true';
        this.panel.dispose();
        FunctionsTemplateGalleryController.createOrShow(this.extensionContext, {
            initialLocation: this.launchOptions.initialLocation,
            initialFilters: {
                ...this.launchOptions.initialFilters,
                search: connector.templateSearch,
            },
        });
    }

    private async loadNamespaces(actionContext: IActionContext): Promise<void> {
        try {
            const result = await this.dataClient.listNamespaces(actionContext);
            this.namespaces.clear();
            for (const namespace of result.namespaces) {
                this.namespaces.set(namespace.id, namespace);
            }

            await this.postMessage({
                command: 'namespacesLoaded',
                namespaces: result.namespaces,
                warning: result.failedSubscriptionCount > 0 ?
                    localize(
                        'connectorNamespacesPartialLoad',
                        'Connector Namespaces could not be loaded from {0} subscription(s).',
                        result.failedSubscriptionCount.toString(),
                    ) :
                    undefined,
            });
        } catch (error) {
            actionContext.telemetry.properties.connectorPickerLoad = 'namespaces';
            actionContext.telemetry.properties.result = 'Failed';
            await this.postMessage({
                command: 'loadFailed',
                scope: 'namespaces',
                message: parseError(error).message,
            });
        }
    }

    private async loadCatalog(actionContext: IActionContext, namespaceId: string): Promise<void> {
        const namespace = this.namespaces.get(namespaceId);
        if (!namespace) {
            return;
        }

        try {
            let catalog = this.catalogs.get(namespaceId);
            if (!catalog) {
                catalog = await this.dataClient.listCatalog(actionContext, namespace);
                this.catalogs.set(namespaceId, catalog);
            }

            await this.postMessage({
                command: 'catalogLoaded',
                namespaceId,
                connectors: catalog.connectors,
                operations: catalog.operations,
            });
        } catch (error) {
            actionContext.telemetry.properties.connectorPickerLoad = 'catalog';
            actionContext.telemetry.properties.result = 'Failed';
            await this.postMessage({
                command: 'loadFailed',
                scope: 'catalog',
                namespaceId,
                message: parseError(error).message,
            });
        }
    }

    private async postMessage(message: ConnectorTriggerPickerResponse): Promise<void> {
        await this.panel.webview.postMessage(message);
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
