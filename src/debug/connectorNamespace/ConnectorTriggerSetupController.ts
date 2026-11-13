/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import * as vscode from 'vscode';
import { escapeWebviewInitialData } from '../../commands/createNewProject/connectorTriggerPicker/escapeWebviewInitialData';
import { localize } from '../../localize';
import { type ConnectorTriggerParametersViewModel } from '../../webview/connectorTriggerParameters/ConnectorTriggerParametersViewModel';
import { type ConnectorTriggerSetupViewModel } from '../../webview/connectorTriggerParameters/ConnectorTriggerSetupViewModel';
import {
    type ConnectorTriggerGateway,
    type ConnectorTriggerOperationResolver,
    type ConnectorTriggerParameterRequest,
    type ConnectorTriggerParameterValue,
    type ConnectorTriggerSetupPlan,
    type ConnectorTriggerSetupRequest,
    type ConnectorTriggerSetupSession,
    type ConnectorTriggerSetupStatus,
    type ConnectorTriggerSetupScopes,
} from './connectorTriggerF5Contracts';
import { ConnectorTriggerParameterForm } from './ConnectorTriggerParameterForm';
import { ConnectorTriggerSetupForm, createConnectorTriggerSetupViewModel } from './ConnectorTriggerSetupForm';

export class ConnectorTriggerSetupController extends WebviewController<ConnectorTriggerSetupViewModel> implements ConnectorTriggerSetupSession {
    private readonly cancellation = new vscode.CancellationTokenSource();
    public readonly cancellationToken = this.cancellation.token;
    private readonly resourceForm: ConnectorTriggerSetupForm;
    private readonly resourceSelection: Promise<ConnectorTriggerSetupPlan>;
    private resourceCompletion?: { resolve: (plan: ConnectorTriggerSetupPlan) => void; reject: (error: unknown) => void };
    private parameterForm?: ConnectorTriggerParameterForm;
    private parameterViewModel?: ConnectorTriggerParametersViewModel;
    private parameterCompletion?: { resolve: (values: Record<string, ConnectorTriggerParameterValue>) => void; reject: (error: unknown) => void };

    private constructor(
        extensionContext: vscode.ExtensionContext,
        private readonly context: IActionContext,
        request: ConnectorTriggerSetupRequest,
        gateway: ConnectorTriggerGateway,
        private readonly resolver: ConnectorTriggerOperationResolver,
        scopes: ConnectorTriggerSetupScopes,
    ) {
        const viewModel = createConnectorTriggerSetupViewModel(request);
        super(
            extensionContext,
            viewModel.labels.title,
            'connectorTriggerSetup',
            viewModel,
            vscode.ViewColumn.Active,
            undefined,
            {
                distDir: path.join(extensionContext.extensionPath, 'dist', 'webview'),
                scriptFileName: 'connectorTriggerSetup.js',
                styleFileName: 'connectorTriggerSetup.css',
            },
        );
        this.resourceForm = new ConnectorTriggerSetupForm(context, request, gateway, scopes, state => {
            void this.panel.webview.postMessage({ command: 'setupState', state });
        });
        this.resourceSelection = new Promise((resolve, reject) => {
            this.resourceCompletion = { resolve, reject };
        });
        this.registerDisposable(this.onDisposed(() => {
            this.cancellation.cancel();
            this.resourceForm.dispose();
            this.parameterForm?.dispose();
            const error = new UserCancelledError('connectorF5Setup');
            this.resourceCompletion?.reject(error);
            this.parameterCompletion?.reject(error);
            this.resourceCompletion = undefined;
            this.parameterCompletion = undefined;
            this.cancellation.dispose();
        }));
        this.registerDisposable(this.panel.webview.onDidReceiveMessage((message: unknown) => {
            if (message && typeof message === 'object' &&
                'command' in message && message.command === 'cancelParameters') {
                this.panel.dispose();
                return;
            }
            // The pending F5 action owns the context and error handling for these callbacks.
            void this.handleMessage(message).catch((error: unknown) => {
                this.resourceCompletion?.reject(error);
                this.parameterCompletion?.reject(error);
                this.resourceCompletion = undefined;
                this.parameterCompletion = undefined;
                this.panel.dispose();
            });
        }));
        extensionContext.subscriptions.push(this.panel);
    }

    public static open(
        extensionContext: vscode.ExtensionContext,
        context: IActionContext,
        request: ConnectorTriggerSetupRequest,
        gateway: ConnectorTriggerGateway,
        resolver: ConnectorTriggerOperationResolver,
        scopes: ConnectorTriggerSetupScopes,
    ): ConnectorTriggerSetupController {
        return new ConnectorTriggerSetupController(extensionContext, context, request, gateway, resolver, scopes);
    }

    public async selectResources(): Promise<ConnectorTriggerSetupPlan> {
        return await this.resourceSelection;
    }

    public setStatus(status: ConnectorTriggerSetupStatus): void {
        this.resourceForm.setStatus(status);
    }

    public override dispose(): void {
        if (!this.isDisposed) {
            super.dispose();
            this.panel.dispose();
        }
    }

    public async collectParameters(request: ConnectorTriggerParameterRequest): Promise<Record<string, ConnectorTriggerParameterValue>> {
        if (this.cancellationToken.isCancellationRequested) {
            throw new UserCancelledError('connectorF5Setup');
        }
        return await new Promise((resolve, reject) => {
            this.parameterForm = new ConnectorTriggerParameterForm(this.context, request, this.resolver, state => {
                void this.panel.webview.postMessage({ command: 'parameterState', state });
            });
            this.parameterCompletion = { resolve, reject };
            this.parameterViewModel = createConnectorTriggerParametersViewModel(request);
            this.resourceForm.setStatus('parameters');
            this.postParameterConfiguration();
        });
    }

    private postParameterConfiguration(): void {
        if (this.parameterViewModel && this.parameterCompletion) {
            // The webview answers with 'initialize', which replays the current parameter state.
            void this.panel.webview.postMessage({ command: 'parameterConfiguration', viewModel: this.parameterViewModel });
        }
    }

    private async handleMessage(message: unknown): Promise<void> {
        const command = message && typeof message === 'object' && 'command' in message ? message.command : undefined;
        if (this.parameterForm && ![
            'initializeSetup', 'selectSubscription', 'selectRegion', 'selectConnector', 'selectEvent',
            'signInSetup', 'loadAllSubscriptions', 'loadFilteredSubscriptions',
            'selectNamespace', 'selectConnection', 'editResource', 'approveSetup', 'reloadSetup',
        ].includes(typeof command === 'string' ? command : '')) {
            const values = await this.parameterForm.handleMessage(message);
            if (values !== undefined && this.parameterCompletion) {
                const completion = this.parameterCompletion;
                this.parameterCompletion = undefined;
                this.parameterForm.dispose();
                completion.resolve(values);
            }
        } else {
            const plan = await this.resourceForm.handleMessage(message);
            if (command === 'initializeSetup') {
                this.postParameterConfiguration();
            }
            if (plan && this.resourceCompletion) {
                const completion = this.resourceCompletion;
                this.resourceCompletion = undefined;
                completion.resolve(plan);
            }
        }
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        return escapeWebviewInitialData(super.getDocumentTemplate(webview));
    }
}

export function createConnectorTriggerParametersViewModel(
    request: ConnectorTriggerParameterRequest,
): ConnectorTriggerParametersViewModel {
    return {
        connector: request.operation.connectorLabel ?? request.target.connectorId,
        event: request.operation.label ?? request.target.operationId,
        namespace: request.namespace.name,
        connection: request.connection.name,
        labels: {
            title: localize('connectorParametersTitle', 'Configure Connector Trigger'),
            subtitle: localize('connectorParametersSubtitle', 'Choose event parameters using your authenticated connector connection.'),
            connectorTriggers: localize('connectorTriggers', 'Connector Triggers'),
            namespace: localize('connectorParameterNamespace', 'Connector Namespace'),
            connection: localize('connectorParameterConnection', 'Connection'),
            parameters: localize('connectorParameterParameters', 'Parameters'),
            connected: localize('connectorParameterConnected', 'Authenticated'),
            required: localize('connectorParameterRequiredLabel', 'Required'),
            optional: localize('connectorParameterOptionalLabel', 'Optional'),
            advanced: localize('connectorParameterAdvanced', 'Optional parameters'),
            loading: localize('connectorParameterLoading', 'Loading choices from the connector...'),
            empty: localize('connectorParameterEmpty', 'The connector returned no choices here.'),
            dependencies: localize('connectorParameterDependencies', 'First configure:'),
            selectValue: localize('connectorParameterSelectValue', 'Select a value'),
            selected: localize('connectorParameterSelected', 'Selected:'),
            browse: localize('connectorParameterBrowse', 'Browse folders'),
            back: localize('connectorParameterBack', 'Back to previous folder'),
            selectFolder: localize('connectorParameterSelectFolder', 'Select this folder'),
            clear: localize('connectorParameterClear', 'Clear selection'),
            retry: localize('connectorParameterRetry', 'Reload choices'),
            apply: localize('connectorParameterApply', 'Apply and continue'),
            cancel: localize('connectorParameterCancel', 'Cancel setup'),
            runtimeNotice: localize('connectorParameterRuntimeNotice', 'Apply saves these values to the event\'s Trigger Config and writes the reviewed connection and local credential settings. Function source is unchanged.'),
        },
    };
}
