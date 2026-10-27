/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController, type InitialTemplateFilters } from '@microsoft/vscode-azext-webview';
import * as vscode from 'vscode';
import {
    isConnectorTriggerPickerMessage,
    type ConnectorTriggerPickerViewModel,
} from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';
import { FunctionsTemplateGalleryController } from '../FunctionsTemplateGalleryController';
import { getConnectorTriggerPickerBundleLocation } from './connectorTriggerPickerBundleLocation';
import { createConnectorTriggerPickerViewModel } from './createConnectorTriggerPickerViewModel';
import { getConnectorTriggerOption, getConnectorTriggerTemplateFilters } from './connectorTriggerCatalog';
import { escapeWebviewInitialData } from './escapeWebviewInitialData';

export interface ConnectorTriggerPickerLaunchOptions {
    initialLocation?: string;
    initialFilters: InitialTemplateFilters;
}

export class ConnectorTriggerPickerController extends WebviewController<ConnectorTriggerPickerViewModel> {
    private static currentController: ConnectorTriggerPickerController | undefined;

    private constructor(
        context: vscode.ExtensionContext,
        private readonly launchOptions: ConnectorTriggerPickerLaunchOptions,
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
    ): ConnectorTriggerPickerController {
        const existing = ConnectorTriggerPickerController.currentController;
        if (existing && !existing.isDisposed) {
            existing.panel.dispose();
        }

        const controller = new ConnectorTriggerPickerController(context, launchOptions);
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

        const connector = getConnectorTriggerOption(message.connectorId);
        if (!connector) {
            return;
        }

        const initialFilters = getConnectorTriggerTemplateFilters(
            this.launchOptions.initialFilters,
            connector.id,
        );
        if (!initialFilters) {
            return;
        }

        actionContext.telemetry.properties.connector = connector.id;
        this.panel.dispose();
        FunctionsTemplateGalleryController.createOrShow(this.extensionContext, {
            initialLocation: this.launchOptions.initialLocation,
            initialFilters,
        });
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        return escapeWebviewInitialData(super.getDocumentTemplate(webview));
    }
}
