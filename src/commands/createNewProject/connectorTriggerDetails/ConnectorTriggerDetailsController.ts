/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling } from '@microsoft/vscode-azext-utils';
import { WebviewController } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    type ConnectorTriggerCopyField,
    type ConnectorTriggerDetailsViewModel,
} from '../../../webview/connectorTriggerDetails/ConnectorTriggerDetailsViewModel';

type ConnectorTriggerDetailsMessage =
    | { type: 'close' }
    | { type: 'continue' }
    | { type: 'copy'; field: ConnectorTriggerCopyField };

export class ConnectorTriggerDetailsController extends WebviewController<ConnectorTriggerDetailsViewModel> {
    private static currentController: ConnectorTriggerDetailsController | undefined;

    private constructor(
        context: vscode.ExtensionContext,
        private readonly viewModel: ConnectorTriggerDetailsViewModel,
        viewColumn: vscode.ViewColumn,
        private onContinue: () => void,
    ) {
        super(
            context,
            viewModel.labels.panelTitle,
            'connectorTriggerDetails',
            viewModel,
            viewColumn,
            undefined,
            {
                distDir: path.join(context.extensionPath, 'dist', 'webview'),
                scriptFileName: 'connectorTriggerDetails.js',
                styleFileName: 'connectorTriggerDetails.css',
            },
        );

        this.registerDisposable(this.panel.webview.onDidReceiveMessage(message => {
            void callWithTelemetryAndErrorHandling('azureFunctions.connectorTriggerDetails.handleMessage', async () => {
                await this.handleMessage(message);
            });
        }));
        this.registerDisposable(this.onDisposed(() => {
            if (ConnectorTriggerDetailsController.currentController === this) {
                ConnectorTriggerDetailsController.currentController = undefined;
            }
        }));
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        viewModel: ConnectorTriggerDetailsViewModel,
        onContinue: () => void,
        viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
    ): ConnectorTriggerDetailsController {
        const existing = ConnectorTriggerDetailsController.currentController;
        if (existing && !existing.isDisposed && existing.viewModel.templateId === viewModel.templateId) {
            existing.onContinue = onContinue;
            existing.revealToForeground(viewColumn);
            return existing;
        }

        if (existing && !existing.isDisposed) {
            existing.panel.dispose();
        }

        const controller = new ConnectorTriggerDetailsController(context, viewModel, viewColumn, onContinue);
        ConnectorTriggerDetailsController.currentController = controller;
        return controller;
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (!isConnectorTriggerDetailsMessage(message)) {
            return;
        }

        switch (message.type) {
            case 'close':
                this.panel.dispose();
                break;
            case 'continue':
                this.panel.dispose();
                this.onContinue();
                break;
            case 'copy':
                await this.copyValue(message.field);
                break;
        }
    }

    private async copyValue(field: ConnectorTriggerCopyField): Promise<void> {
        const copyValue = this.viewModel.pollingEndpoint[field].copyValue;
        if (!copyValue) {
            return;
        }

        let success = true;
        try {
            await vscode.env.clipboard.writeText(copyValue);
        } catch {
            success = false;
        }

        await this.panel.webview.postMessage({ type: 'copyResult', field, success });
    }
}

function isConnectorTriggerDetailsMessage(message: unknown): message is ConnectorTriggerDetailsMessage {
    if (!message || typeof message !== 'object' || !('type' in message)) {
        return false;
    }

    const type = message.type;
    if (type === 'close' || type === 'continue') {
        return true;
    }

    return type === 'copy' &&
        'field' in message &&
        (message.field === 'baseUrl' || message.field === 'triggerConfigurationName');
}
