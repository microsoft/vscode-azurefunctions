/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { Button } from '@fluentui/react-components';
import { useConfiguration, WebviewContext } from '@microsoft/vscode-azext-webview/webview';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ConnectorTilePicker } from './ConnectorTilePicker';
import {
    isConnectorTriggerPickerResponse,
    type ConnectorNamespaceOption,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
} from './ConnectorTriggerPickerViewModel';

export function ConnectorTriggerPickerView(): JSX.Element {
    const viewModel = useConfiguration<ConnectorTriggerPickerViewModel>();
    const { vscodeApi } = useContext(WebviewContext);
    const [namespaces, setNamespaces] = useState<ConnectorNamespaceOption[]>([]);
    const [namespacesLoading, setNamespacesLoading] = useState(true);
    const [namespaceWarning, setNamespaceWarning] = useState<string>();
    const [selectedNamespaceId, setSelectedNamespaceId] = useState('');
    const [catalogNamespaceId, setCatalogNamespaceId] = useState('');
    const [connectors, setConnectors] = useState<ConnectorTriggerOption[]>([]);
    const [operations, setOperations] = useState<ConnectorTriggerOperationOption[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [selectedConnectorId, setSelectedConnectorId] = useState('');
    const [selectedOperationId, setSelectedOperationId] = useState('');
    const [loadError, setLoadError] = useState<{
        scope: 'namespaces' | 'catalog';
        message: string;
    }>();
    const selectedNamespaceIdRef = useRef('');

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
                setNamespaces(message.namespaces);
                setNamespaceWarning(message.warning);
                setSelectedNamespaceId(current =>
                    message.namespaces.some(namespace => namespace.id === current) ?
                        current :
                        message.namespaces.length === 1 ? message.namespaces[0].id : '');
            } else if (message.command === 'catalogLoaded') {
                if (message.namespaceId !== selectedNamespaceIdRef.current) {
                    return;
                }
                setCatalogLoading(false);
                setCatalogNamespaceId(message.namespaceId);
                setConnectors(message.connectors);
                setOperations(message.operations);
            } else {
                if (message.scope === 'catalog' &&
                    message.namespaceId !== selectedNamespaceIdRef.current) {
                    return;
                }
                setNamespacesLoading(current => message.scope === 'namespaces' ? false : current);
                setCatalogLoading(current => message.scope === 'catalog' ? false : current);
                setLoadError({ scope: message.scope, message: message.message });
            }
        };

        window.addEventListener('message', listener);
        loadNamespaces();
        return () => window.removeEventListener('message', listener);
    }, [loadNamespaces]);

    useEffect(() => {
        selectedNamespaceIdRef.current = selectedNamespaceId;
        setSelectedConnectorId('');
        setSelectedOperationId('');
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

    const visibleConnectors = catalogNamespaceId === selectedNamespaceId ? connectors : [];
    const selectedConnector = useMemo(
        () => visibleConnectors.find(connector => connector.id === selectedConnectorId),
        [selectedConnectorId, visibleConnectors],
    );
    const visibleOperations = useMemo(
        () => operations.filter(operation =>
            operation.connectorId.localeCompare(
                selectedConnectorId,
                undefined,
                { sensitivity: 'accent' },
            ) === 0),
        [operations, selectedConnectorId],
    );

    return (
        <main className="page">
            <header className="header">
                <h1>{viewModel.labels.title}</h1>
            </header>

            <section className="form-section">
                <label htmlFor="connector-namespace">{viewModel.labels.namespaceGroup}</label>
                {namespacesLoading ?
                    <p className="status-text">{viewModel.labels.loadingNamespaces}</p> :
                    namespaces.length === 0 ?
                        <p className="status-text">{viewModel.labels.noNamespaces}</p> :
                        <select
                            id="connector-namespace"
                            value={selectedNamespaceId}
                            onChange={event => setSelectedNamespaceId(event.target.value)}
                        >
                            <option value="">{viewModel.labels.selectNamespace}</option>
                            {namespaces.map(namespace =>
                                <option key={namespace.id} value={namespace.id}>
                                    {formatNamespaceLabel(namespace)}
                                </option>
                            )}
                        </select>
                }
                {namespaceWarning && <p className="warning-text">{namespaceWarning}</p>}
                {loadError?.scope === 'namespaces' &&
                    <LoadError
                        message={loadError.message}
                        retryLabel={viewModel.labels.retry}
                        onRetry={loadNamespaces}
                    />
                }
            </section>

            {selectedNamespaceId &&
                <section className="connector-section">
                    <h2>{viewModel.labels.connectorGroup}</h2>
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
                                <ConnectorTilePicker
                                    label={viewModel.labels.connectorGroup}
                                    options={visibleConnectors}
                                    value={selectedConnectorId}
                                    onChange={connectorId => {
                                        setSelectedConnectorId(connectorId);
                                        setSelectedOperationId('');
                                    }}
                                />
                    }
                </section>
            }

            {selectedConnector &&
                <section className="form-section trigger-section">
                    <label htmlFor="connector-trigger">{viewModel.labels.triggerGroup}</label>
                    {catalogLoading ?
                        <p className="status-text">{viewModel.labels.loadingTriggers}</p> :
                        visibleOperations.length === 0 ?
                            <p className="status-text">{viewModel.labels.noTriggers}</p> :
                            <select
                                id="connector-trigger"
                                value={selectedOperationId}
                                onChange={event => setSelectedOperationId(event.target.value)}
                            >
                                <option value="">{viewModel.labels.selectTrigger}</option>
                                {visibleOperations.map(operation =>
                                    <option key={operation.id} value={operation.id}>
                                        {operation.label}
                                    </option>
                                )}
                            </select>
                    }
                </section>
            }

            <footer className="footer">
                <div className="actions">
                    <Button
                        appearance="secondary"
                        onClick={() => vscodeApi.postMessage({ command: 'close' })}
                    >
                        {viewModel.labels.close}
                    </Button>
                    <Button
                        appearance="primary"
                        disabled={!selectedConnector || !selectedOperationId}
                        onClick={() => selectedConnector && selectedOperationId && vscodeApi.postMessage({
                            command: 'continue',
                            namespaceId: selectedNamespaceId,
                            connectorId: selectedConnector.id,
                            operationId: selectedOperationId,
                        })}
                    >
                        {viewModel.labels.continue}
                    </Button>
                </div>
            </footer>
        </main>
    );
}

function formatNamespaceLabel(namespace: ConnectorNamespaceOption): string {
    const context = [namespace.subscriptionName, namespace.location].filter(Boolean).join(' - ');
    return context ? `${namespace.label} (${context})` : namespace.label;
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
