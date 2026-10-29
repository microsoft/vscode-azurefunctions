/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { Button } from '@fluentui/react-components';
import { useConfiguration, WebviewContext } from '@microsoft/vscode-azext-webview/webview';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ConnectorConfigureStep, getDeliverySupport } from './ConnectorConfigureStep';
import { ConnectorEventStep } from './ConnectorEventStep';
import { ConnectorTilePicker } from './ConnectorTilePicker';
import { ConnectorTriggerShell, type ConnectorTriggerStep } from './ConnectorTriggerShell';
import {
    isConnectorTriggerPickerResponse,
    type ConnectorDeliveryMode,
    type ConnectorNamespaceOption,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
} from './ConnectorTriggerPickerViewModel';

const createNamespaceOption = '__createConnectorNamespace__';
const connectorPageSize = 60;

export function ConnectorTriggerPickerView(): JSX.Element {
    const viewModel = useConfiguration<ConnectorTriggerPickerViewModel>();
    const { vscodeApi } = useContext(WebviewContext);
    const [activeStep, setActiveStep] = useState<ConnectorTriggerStep>(1);
    const [namespaces, setNamespaces] = useState<ConnectorNamespaceOption[]>([]);
    const [namespacesLoading, setNamespacesLoading] = useState(true);
    const [creatingNamespace, setCreatingNamespace] = useState(false);
    const [namespaceWarning, setNamespaceWarning] = useState<string>();
    const [selectedNamespaceId, setSelectedNamespaceId] = useState('');
    const [catalogNamespaceId, setCatalogNamespaceId] = useState('');
    const [connectors, setConnectors] = useState<ConnectorTriggerOption[]>([]);
    const [operations, setOperations] = useState<ConnectorTriggerOperationOption[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [connectorSearch, setConnectorSearch] = useState('');
    const [connectorLimit, setConnectorLimit] = useState(connectorPageSize);
    const [selectedConnectorId, setSelectedConnectorId] = useState('');
    const [selectedOperationId, setSelectedOperationId] = useState('');
    const [deliveryMode, setDeliveryMode] = useState<ConnectorDeliveryMode>('Polling');
    const [operationInputsLoading, setOperationInputsLoading] = useState(false);
    const [operationInputsError, setOperationInputsError] = useState('');
    const [projectCreating, setProjectCreating] = useState(false);
    const [projectCreationDetail, setProjectCreationDetail] = useState('');
    const [projectCreationError, setProjectCreationError] = useState('');
    const [loadError, setLoadError] = useState<{
        scope: 'namespaces' | 'catalog';
        message: string;
    }>();
    const selectedNamespaceIdRef = useRef('');
    const selectedOperationKeyRef = useRef('');
    const operationInputRequestKeyRef = useRef('');

    const loadNamespaces = useCallback(() => {
        setNamespacesLoading(true);
        setLoadError(undefined);
        vscodeApi.postMessage({ command: 'loadNamespaces' });
    }, [vscodeApi]);

    useEffect(() => {
        const listener = (event: MessageEvent<unknown>) => {
            if (!isConnectorTriggerPickerResponse(event.data)) {
                return;
            }

            const message = event.data;
            if (message.command === 'namespacesLoaded') {
                setNamespacesLoading(false);
                setCreatingNamespace(false);
                setNamespaces(message.namespaces);
                setNamespaceWarning(message.warning);
                setSelectedNamespaceId(current =>
                    message.selectedNamespaceId &&
                        message.namespaces.some(namespace => namespace.id === message.selectedNamespaceId) ?
                        message.selectedNamespaceId :
                        message.namespaces.some(namespace => namespace.id === current) ?
                            current :
                            message.namespaces.length === 1 ? message.namespaces[0].id : '');
            } else if (message.command === 'namespaceCreationCancelled') {
                setCreatingNamespace(false);
            } else if (message.command === 'catalogLoaded') {
                if (message.namespaceId !== selectedNamespaceIdRef.current) {
                    return;
                }
                setCatalogLoading(false);
                setCatalogNamespaceId(message.namespaceId);
                setConnectors(message.connectors);
                setOperations(message.operations);
            } else if (message.command === 'operationInputsLoaded') {
                if (message.namespaceId !== selectedNamespaceIdRef.current) {
                    return;
                }
                setOperations(current => current.map(operation =>
                    equalsIgnoreCase(operation.connectorId, message.connectorId) &&
                        equalsIgnoreCase(operation.id, message.operationId) ?
                        { ...operation, inputDefinitions: message.inputDefinitions } :
                        operation));
                if (getOperationKey(
                    message.namespaceId,
                    message.connectorId,
                    message.operationId,
                ) === selectedOperationKeyRef.current) {
                    setOperationInputsLoading(false);
                    setOperationInputsError('');
                }
            } else if (message.command === 'operationInputsFailed') {
                if (getOperationKey(
                    message.namespaceId,
                    message.connectorId,
                    message.operationId,
                ) === selectedOperationKeyRef.current) {
                    setOperationInputsLoading(false);
                    setOperationInputsError(message.message);
                }
            } else if (message.command === 'projectCreationStarted') {
                setProjectCreating(true);
                setProjectCreationDetail(viewModel.labels.creatingProject);
                setProjectCreationError('');
            } else if (message.command === 'projectCreationProgress') {
                setProjectCreationDetail(message.detail);
            } else if (message.command === 'projectCreationFailed') {
                setProjectCreating(false);
                setProjectCreationDetail('');
                setProjectCreationError(message.message);
            } else {
                if (message.scope === 'catalog' &&
                    message.namespaceId !== selectedNamespaceIdRef.current) {
                    return;
                }
                setNamespacesLoading(current => message.scope === 'namespaces' ? false : current);
                setCatalogLoading(current => message.scope === 'catalog' ? false : current);
                setCreatingNamespace(false);
                setLoadError({ scope: message.scope, message: message.message });
            }
        };

        window.addEventListener('message', listener);
        loadNamespaces();
        return () => window.removeEventListener('message', listener);
    }, [loadNamespaces, viewModel.labels.creatingProject]);

    useEffect(() => {
        selectedNamespaceIdRef.current = selectedNamespaceId;
        setActiveStep(1);
        setSelectedConnectorId('');
        setSelectedOperationId('');
        setDeliveryMode('Polling');
        setOperationInputsLoading(false);
        setOperationInputsError('');
        selectedOperationKeyRef.current = '';
        operationInputRequestKeyRef.current = '';
        setProjectCreating(false);
        setProjectCreationDetail('');
        setProjectCreationError('');
        setConnectorSearch('');
        setConnectorLimit(connectorPageSize);
        setConnectors([]);
        setOperations([]);
        setCatalogNamespaceId('');
        setLoadError(current => current?.scope === 'catalog' ? undefined : current);

        if (selectedNamespaceId) {
            setCatalogLoading(true);
            vscodeApi.postMessage({
                command: 'loadCatalog',
                namespaceId: selectedNamespaceId,
            });
        } else {
            setCatalogLoading(false);
        }
    }, [selectedNamespaceId, vscodeApi]);

    useEffect(() => {
        setConnectorLimit(connectorPageSize);
    }, [connectorSearch]);

    const visibleConnectors = catalogNamespaceId === selectedNamespaceId ? connectors : [];
    const selectedNamespace = namespaces.find(namespace => namespace.id === selectedNamespaceId);
    const selectedConnector = visibleConnectors.find(connector => connector.id === selectedConnectorId);
    const connectorOperations = operations.filter(operation =>
        equalsIgnoreCase(operation.connectorId, selectedConnectorId));
    const selectedOperation = connectorOperations.find(operation => operation.id === selectedOperationId);
    const filteredConnectors = useMemo(() => {
        const query = connectorSearch.trim().toLocaleLowerCase();
        if (!query) {
            return visibleConnectors;
        }

        return visibleConnectors.filter(connector =>
            connector.label.toLocaleLowerCase().includes(query) ||
            connector.description?.toLocaleLowerCase().includes(query));
    }, [connectorSearch, visibleConnectors]);
    const displayedConnectors = filteredConnectors.slice(0, connectorLimit);

    const requestOperationInputs = useCallback((force = false) => {
        if (!selectedNamespaceId || !selectedConnectorId || !selectedOperationId) {
            return;
        }

        const key = getOperationKey(
            selectedNamespaceId,
            selectedConnectorId,
            selectedOperationId,
        );
        if (!force && operationInputRequestKeyRef.current === key) {
            return;
        }

        operationInputRequestKeyRef.current = key;
        setOperationInputsLoading(true);
        setOperationInputsError('');
        vscodeApi.postMessage({
            command: 'loadOperationInputs',
            namespaceId: selectedNamespaceId,
            connectorId: selectedConnectorId,
            operationId: selectedOperationId,
        });
    }, [
        selectedConnectorId,
        selectedNamespaceId,
        selectedOperationId,
        vscodeApi,
    ]);

    useEffect(() => {
        selectedOperationKeyRef.current = getOperationKey(
            selectedNamespaceId,
            selectedConnectorId,
            selectedOperationId,
        );
        if (activeStep !== 3 || !selectedOperation) {
            return;
        }

        if (selectedOperation.inputDefinitions === undefined) {
            requestOperationInputs();
        } else {
            setOperationInputsLoading(false);
            setOperationInputsError('');
        }
    }, [
        activeStep,
        requestOperationInputs,
        selectedConnectorId,
        selectedNamespaceId,
        selectedOperation,
        selectedOperationId,
    ]);

    const selectConnector = (connectorId: string) => {
        if (connectorId !== selectedConnectorId) {
            setSelectedOperationId('');
            setDeliveryMode('Polling');
            setOperationInputsLoading(false);
            setOperationInputsError('');
            setProjectCreationError('');
        }
        setSelectedConnectorId(connectorId);
        setActiveStep(2);
    };

    const selectOperation = (operationId: string) => {
        const operation = connectorOperations.find(item => item.id === operationId);
        if (!operation) {
            return;
        }

        const support = getDeliverySupport(operation);
        if (!support.polling) {
            return;
        }
        setSelectedOperationId(operationId);
        setDeliveryMode('Polling');
        setOperationInputsLoading(false);
        setOperationInputsError('');
        setProjectCreationError('');
        setActiveStep(3);
    };

    const useTemplate = () => {
        if (projectCreating || !selectedNamespace || !selectedConnector || !selectedOperation) {
            return;
        }

        setProjectCreating(true);
        setProjectCreationDetail(viewModel.labels.creatingProject);
        setProjectCreationError('');
        vscodeApi.postMessage({
            command: 'continue',
            namespaceId: selectedNamespace.id,
            connectorId: selectedConnector.id,
            operationId: selectedOperation.id,
            deliveryMode,
        });
    };

    return (
        <main className="page">
            <ConnectorTriggerShell
                activeStep={activeStep}
                canOpenEvent={!!selectedConnector}
                canOpenConfigure={!!selectedOperation}
                labels={viewModel.labels}
                onBrowseTemplates={() => vscodeApi.postMessage({ command: 'browseTemplates' })}
                onOpenCopilot={() => vscodeApi.postMessage({ command: 'openCopilot' })}
                onStepChange={setActiveStep}
            />

            {activeStep === 1 &&
                <section className="step-page connector-page">
                    <h2>{viewModel.labels.connectorPageTitle}</h2>
                    <p className="step-description">{viewModel.labels.connectorPageDescription}</p>

                    <div className="namespace-field">
                        <label htmlFor="connector-namespace">{viewModel.labels.namespaceGroup}</label>
                        {namespacesLoading ?
                            <p className="status-text">{viewModel.labels.loadingNamespaces}</p> :
                            <select
                                id="connector-namespace"
                                value={selectedNamespaceId}
                                disabled={creatingNamespace}
                                onChange={event => {
                                    const value = event.target.value;
                                    if (value === createNamespaceOption) {
                                        setCreatingNamespace(true);
                                        setLoadError(undefined);
                                        vscodeApi.postMessage({ command: 'createNamespace' });
                                    } else {
                                        setSelectedNamespaceId(value);
                                    }
                                }}
                            >
                                <option value="">{viewModel.labels.selectNamespace}</option>
                                <option value={createNamespaceOption}>{viewModel.labels.createNamespace}</option>
                                {namespaces.map(namespace =>
                                    <option key={namespace.id} value={namespace.id}>
                                        {formatNamespaceLabel(namespace)}
                                    </option>
                                )}
                            </select>
                        }
                        {!namespacesLoading && namespaces.length === 0 &&
                            <p className="status-text">{viewModel.labels.noNamespaces}</p>
                        }
                        {creatingNamespace &&
                            <p className="status-text">{viewModel.labels.creatingNamespace}</p>
                        }
                        {namespaceWarning && <p className="warning-text">{namespaceWarning}</p>}
                        {loadError?.scope === 'namespaces' &&
                            <LoadError
                                message={loadError.message}
                                retryLabel={viewModel.labels.retry}
                                onRetry={loadNamespaces}
                            />
                        }
                    </div>

                    {selectedNamespaceId &&
                        <>
                            {catalogLoading ?
                                <p className="status-text">{viewModel.labels.loadingConnectors}</p> :
                                loadError?.scope === 'catalog' ?
                                    <LoadError
                                        message={loadError.message}
                                        retryLabel={viewModel.labels.retry}
                                        onRetry={() => {
                                            setLoadError(undefined);
                                            setCatalogLoading(true);
                                            vscodeApi.postMessage({
                                                command: 'loadCatalog',
                                                namespaceId: selectedNamespaceId,
                                            });
                                        }}
                                    /> :
                                    visibleConnectors.length === 0 ?
                                        <p className="status-text">{viewModel.labels.noConnectors}</p> :
                                        <>
                                            <label className="search-field">
                                                <span className="codicon codicon-search" aria-hidden="true" />
                                                <input
                                                    value={connectorSearch}
                                                    placeholder={viewModel.labels.connectorSearchPlaceholder}
                                                    onChange={event => setConnectorSearch(event.target.value)}
                                                />
                                            </label>
                                            <p className="result-count">
                                                {format(
                                                    viewModel.labels.connectorCount,
                                                    filteredConnectors.length.toString(),
                                                )}
                                            </p>
                                            <ConnectorTilePicker
                                                label={viewModel.labels.connectorGroup}
                                                options={displayedConnectors}
                                                value={selectedConnectorId}
                                                onChange={selectConnector}
                                            />
                                            {displayedConnectors.length < filteredConnectors.length &&
                                                <Button
                                                    appearance="secondary"
                                                    className="show-more"
                                                    onClick={() => setConnectorLimit(limit => limit + connectorPageSize)}
                                                >
                                                    {viewModel.labels.showMoreConnectors}
                                                </Button>
                                            }
                                        </>
                            }
                        </>
                    }
                </section>
            }

            {activeStep === 2 && selectedConnector &&
                <ConnectorEventStep
                    connector={selectedConnector}
                    labels={viewModel.labels}
                    operations={connectorOperations}
                    selectedOperationId={selectedOperationId}
                    onChangeConnector={() => setActiveStep(1)}
                    onSelectOperation={selectOperation}
                />
            }

            {activeStep === 3 && selectedNamespace && selectedConnector && selectedOperation &&
                <ConnectorConfigureStep
                    connector={selectedConnector}
                    deliveryMode={deliveryMode}
                    labels={viewModel.labels}
                    language={viewModel.language}
                    namespace={selectedNamespace}
                    operation={selectedOperation}
                    operationInputsError={operationInputsError}
                    operationInputsLoading={operationInputsLoading}
                    projectCreating={projectCreating}
                    projectCreationDetail={projectCreationDetail}
                    projectCreationError={projectCreationError}
                    onChangeDeliveryMode={setDeliveryMode}
                    onChangeEvent={() => setActiveStep(2)}
                    onRetryOperationInputs={() => requestOperationInputs(true)}
                    onUseTemplate={useTemplate}
                />
            }
        </main>
    );
}

function formatNamespaceLabel(namespace: ConnectorNamespaceOption): string {
    const context = [namespace.subscriptionName, namespace.location].filter(Boolean).join(' - ');
    return context ? `${namespace.label} (${context})` : namespace.label;
}

function equalsIgnoreCase(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function getOperationKey(
    namespaceId: string,
    connectorId: string,
    operationId: string,
): string {
    return `${namespaceId}\n${connectorId.toLowerCase()}\n${operationId.toLowerCase()}`;
}

function format(template: string, ...values: string[]): string {
    return values.reduce(
        (result, value, index) => result.replace(`{${index}}`, value),
        template,
    );
}

function LoadError({
    message,
    retryLabel,
    onRetry,
}: {
    message: string;
    retryLabel: string;
    onRetry: () => void;
}): JSX.Element {
    return (
        <div className="load-error" role="alert">
            <p>{message}</p>
            <Button appearance="secondary" onClick={onRetry}>{retryLabel}</Button>
        </div>
    );
}
