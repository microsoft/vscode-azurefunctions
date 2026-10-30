/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { Button } from '@fluentui/react-components';
import { useConfiguration, WebviewContext } from '@microsoft/vscode-azext-webview/webview';
import { useCallback, useContext, useEffect, useMemo, useState, type JSX } from 'react';
import { ConnectorEventStep } from './ConnectorEventStep';
import { ConnectorTilePicker } from './ConnectorTilePicker';
import {
    partitionConnectorOptions,
    shouldExpandOtherConnectors,
} from './connectorTriggerGroups';
import { reconcileConnectorTriggerSelection } from './connectorTriggerPickerState';
import { ConnectorTriggerShell, type ConnectorTriggerStep } from './ConnectorTriggerShell';
import {
    isConnectorTriggerPickerResponse,
    type ConnectorTriggerAzureContextDisplay,
    type ConnectorTriggerCatalogSource,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
} from './ConnectorTriggerPickerViewModel';

const connectorPageSize = 60;

export function ConnectorTriggerPickerView(): JSX.Element {
    const viewModel = useConfiguration<ConnectorTriggerPickerViewModel>();
    const { vscodeApi } = useContext(WebviewContext);
    const [activeStep, setActiveStep] = useState<ConnectorTriggerStep>(1);
    const [azureContext, setAzureContext] = useState<ConnectorTriggerAzureContextDisplay>();
    const [azureContextLoading, setAzureContextLoading] = useState(true);
    const [azureContextError, setAzureContextError] = useState<string>();
    const [catalogSource, setCatalogSource] = useState<ConnectorTriggerCatalogSource>();
    const [catalogWarning, setCatalogWarning] = useState<string>();
    const [selectionUnavailable, setSelectionUnavailable] = useState(false);
    const [connectors, setConnectors] = useState<ConnectorTriggerOption[]>([]);
    const [operations, setOperations] = useState<ConnectorTriggerOperationOption[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [connectorSearch, setConnectorSearch] = useState('');
    const [connectorLimit, setConnectorLimit] = useState(connectorPageSize);
    const [otherConnectorsExpanded, setOtherConnectorsExpanded] = useState(false);
    const [selectedConnectorId, setSelectedConnectorId] = useState('');
    const [selectedOperationId, setSelectedOperationId] = useState('');
    const [projectCreating, setProjectCreating] = useState(false);
    const [projectCreationDetail, setProjectCreationDetail] = useState('');
    const [projectCreationError, setProjectCreationError] = useState('');
    const [loadError, setLoadError] = useState<string>();

    const initialize = useCallback(() => {
        setAzureContextLoading(true);
        setAzureContextError(undefined);
        setLoadError(undefined);
        vscodeApi.postMessage({ command: 'initialize' });
    }, [vscodeApi]);

    const loadCatalog = useCallback(() => {
        if (!azureContext) {
            initialize();
            return;
        }

        setCatalogLoading(true);
        setCatalogWarning(undefined);
        setSelectionUnavailable(false);
        setLoadError(undefined);
        vscodeApi.postMessage({ command: 'loadCatalog' });
    }, [azureContext, initialize, vscodeApi]);

    useEffect(() => {
        const listener = (event: MessageEvent<unknown>) => {
            if (!isConnectorTriggerPickerResponse(event.data)) {
                return;
            }

            const message = event.data;
            if (message.command === 'azureContextSelected') {
                setAzureContext(message.azureContext);
                setAzureContextLoading(false);
                setAzureContextError(undefined);
                setCatalogLoading(true);
                setLoadError(undefined);
                setCatalogSource(undefined);
                setConnectors([]);
                setOperations([]);
                setSelectedConnectorId('');
                setSelectedOperationId('');
                setActiveStep(1);
            } else if (message.command === 'azureContextSelectionCancelled') {
                setAzureContextLoading(false);
                setAzureContextError(message.message);
            } else if (message.command === 'catalogLoaded') {
                setCatalogLoading(false);
                setCatalogSource(message.source);
                setCatalogWarning(message.warning);
                setConnectors(message.connectors);
                setOperations(message.operations);
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
            } else if (message.command === 'loadFailed') {
                if (message.scope === 'azureContext') {
                    setAzureContextLoading(false);
                    setAzureContextError(message.message);
                } else {
                    setCatalogLoading(false);
                    setLoadError(message.message);
                }
            }
        };

        window.addEventListener('message', listener);
        initialize();
        return () => window.removeEventListener('message', listener);
    }, [initialize, viewModel.labels.creatingProject]);

    useEffect(() => {
        setConnectorLimit(connectorPageSize);
    }, [connectorSearch]);

    useEffect(() => {
        if (!catalogSource) {
            return;
        }

        const reconciled = reconcileConnectorTriggerSelection({
            activeStep,
            connectorId: selectedConnectorId,
            operationId: selectedOperationId,
        }, connectors, operations);
        setSelectionUnavailable(reconciled.selectionUnavailable);
        if (reconciled.connectorId !== selectedConnectorId) {
            setSelectedConnectorId(reconciled.connectorId);
        }
        if (reconciled.operationId !== selectedOperationId) {
            setSelectedOperationId(reconciled.operationId);
        }
        if (reconciled.activeStep !== activeStep) {
            setActiveStep(reconciled.activeStep);
        }
    }, [
        activeStep,
        catalogSource,
        connectors,
        operations,
        selectedConnectorId,
        selectedOperationId,
    ]);

    const selectedConnector = connectors.find(connector =>
        connector.id === selectedConnectorId);
    const connectorOperations = operations.filter(operation =>
        equalsIgnoreCase(operation.connectorId, selectedConnectorId));
    const selectedOperation = connectorOperations.find(operation =>
        operation.id === selectedOperationId);
    const selectedCatalogItemUnavailable =
        selectedConnector?.availability === 'unavailable' ||
        selectedOperation?.availability === 'unavailable';
    const filteredConnectors = useMemo(() => {
        const query = connectorSearch.trim().toLocaleLowerCase();
        if (!query) {
            return connectors;
        }

        return connectors.filter(connector =>
            connector.label.toLocaleLowerCase().includes(query) ||
            connector.description?.toLocaleLowerCase().includes(query));
    }, [connectorSearch, connectors]);
    const connectorGroups = useMemo(
        () => partitionConnectorOptions(filteredConnectors),
        [filteredConnectors],
    );
    const otherConnectorsVisible = shouldExpandOtherConnectors(
        connectorSearch,
        otherConnectorsExpanded,
    );
    const displayedOtherConnectors = connectorSearch.trim() ?
        connectorGroups.other :
        connectorGroups.other.slice(0, connectorLimit);

    const selectConnector = (connectorId: string) => {
        if (connectors.find(connector =>
            connector.id === connectorId)?.availability === 'unavailable') {
            return;
        }

        if (connectorId !== selectedConnectorId) {
            setSelectedOperationId('');
            setProjectCreationError('');
        }
        setSelectedConnectorId(connectorId);
        setActiveStep(2);
    };

    const selectOperation = (operationId: string) => {
        const operation = connectorOperations.find(item => item.id === operationId);
        if (!operation ||
            operation.isWebhook ||
            operation.availability === 'unavailable') {
            return;
        }

        setSelectedOperationId(operationId);
        setProjectCreationError('');
    };

    const useTemplate = () => {
        if (projectCreating ||
            catalogLoading ||
            !!loadError ||
            selectedCatalogItemUnavailable ||
            !azureContext ||
            !selectedConnector ||
            !selectedOperation) {
            return;
        }

        setProjectCreating(true);
        setProjectCreationDetail(viewModel.labels.creatingProject);
        setProjectCreationError('');
        vscodeApi.postMessage({
            command: 'continue',
            connectorId: selectedConnector.id,
            operationId: selectedOperation.id,
        });
    };

    return (
        <main className="page">
            <ConnectorTriggerShell
                activeStep={activeStep}
                canOpenEvent={!!selectedConnector}
                labels={viewModel.labels}
                onBrowseTemplates={() => vscodeApi.postMessage({ command: 'browseTemplates' })}
                onOpenCopilot={() => vscodeApi.postMessage({ command: 'openCopilot' })}
                onStepChange={setActiveStep}
            />

            {activeStep === 1 && !azureContext &&
                <AzureContextGate
                    error={azureContextError}
                    labels={viewModel.labels}
                    loading={azureContextLoading}
                    onRetry={initialize}
                />
            }

            {activeStep === 1 && azureContext &&
                <section className="step-page connector-page">
                    <h2>{viewModel.labels.connectorPageTitle}</h2>
                    <p className="step-description">{viewModel.labels.connectorPageDescription}</p>

                    <div className="catalog-status azure-context-status">
                        <strong>
                            {format(
                                viewModel.labels.selectedAzureContext,
                                azureContext.subscriptionName,
                                azureContext.regionDisplayName,
                            )}
                        </strong>
                        <span>{viewModel.labels.catalogSetupDeferred}</span>
                    </div>

                    {catalogSource &&
                        <div className={`catalog-status ${catalogSource}`}>
                            <strong>{getCatalogSourceLabel(catalogSource, viewModel.labels)}</strong>
                            {catalogLoading && <span>{viewModel.labels.refreshingCatalog}</span>}
                            {catalogWarning && <span className="warning-text">{catalogWarning}</span>}
                            {selectionUnavailable &&
                                <span className="warning-text">
                                    {viewModel.labels.selectionUnavailable}
                                </span>
                            }
                        </div>
                    }

                    {catalogLoading && connectors.length === 0 ?
                        <p className="status-text">{viewModel.labels.loadingConnectors}</p> :
                        loadError && connectors.length === 0 ?
                            <LoadError
                                message={loadError}
                                retryLabel={viewModel.labels.retry}
                                onRetry={loadCatalog}
                            /> :
                            connectors.length === 0 ?
                                <p className="status-text">{viewModel.labels.noConnectors}</p> :
                                <>
                                    {loadError &&
                                        <LoadError
                                            message={loadError}
                                            retryLabel={viewModel.labels.retry}
                                            onRetry={loadCatalog}
                                        />
                                    }
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
                                    {connectorGroups.featured.length > 0 &&
                                        <section className="featured-connectors">
                                            <h3>{viewModel.labels.featuredConnectors}</h3>
                                            <ConnectorTilePicker
                                                label={viewModel.labels.featuredConnectors}
                                                options={connectorGroups.featured}
                                                unavailableLabel={viewModel.labels.unavailable}
                                                value={selectedConnectorId}
                                                onChange={selectConnector}
                                            />
                                        </section>
                                    }
                                    {connectorGroups.other.length > 0 &&
                                        <section className="other-connectors">
                                            <button
                                                type="button"
                                                className="other-connectors-toggle"
                                                aria-controls="other-connectors-grid"
                                                aria-expanded={otherConnectorsVisible}
                                                aria-label={otherConnectorsVisible ?
                                                    viewModel.labels.hideOtherConnectors :
                                                    viewModel.labels.showOtherConnectors}
                                                disabled={!!connectorSearch.trim()}
                                                onClick={() => setOtherConnectorsExpanded(
                                                    expanded => !expanded,
                                                )}
                                            >
                                                <span
                                                    className={`codicon codicon-chevron-${otherConnectorsVisible ? 'down' : 'right'}`}
                                                    aria-hidden="true"
                                                />
                                                {format(
                                                    viewModel.labels.otherConnectors,
                                                    connectorGroups.other.length.toString(),
                                                )}
                                            </button>
                                            {otherConnectorsVisible &&
                                                <div id="other-connectors-grid">
                                                    <ConnectorTilePicker
                                                        label={viewModel.labels.connectorGroup}
                                                        options={displayedOtherConnectors}
                                                        unavailableLabel={viewModel.labels.unavailable}
                                                        value={selectedConnectorId}
                                                        onChange={selectConnector}
                                                    />
                                                    {displayedOtherConnectors.length <
                                                        connectorGroups.other.length &&
                                                        <Button
                                                            appearance="secondary"
                                                            className="show-more"
                                                            onClick={() => setConnectorLimit(
                                                                limit => limit + connectorPageSize,
                                                            )}
                                                        >
                                                            {viewModel.labels.showMoreConnectors}
                                                        </Button>
                                                    }
                                                </div>
                                            }
                                        </section>
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
                    projectCreating={projectCreating}
                    projectCreationDetail={projectCreationDetail}
                    projectCreationError={projectCreationError}
                    selectedOperationId={selectedOperationId}
                    templateUnavailable={selectedCatalogItemUnavailable}
                    onChangeConnector={() => setActiveStep(1)}
                    onSelectOperation={selectOperation}
                    onUseTemplate={useTemplate}
                />
            }
        </main>
    );
}

function AzureContextGate({
    error,
    labels,
    loading,
    onRetry,
}: {
    error?: string;
    labels: ConnectorTriggerPickerViewModel['labels'];
    loading: boolean;
    onRetry: () => void;
}): JSX.Element {
    return (
        <section className="step-page azure-context-gate">
            <h2>{labels.connectorPageTitle}</h2>
            <p className="step-description">
                {loading ? labels.selectingAzureContext : error || labels.azureContextRequired}
            </p>
            {!loading &&
                <Button appearance="primary" onClick={onRetry}>
                    {labels.selectAzureContext}
                </Button>
            }
        </section>
    );
}

function equalsIgnoreCase(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function getCatalogSourceLabel(
    source: ConnectorTriggerCatalogSource,
    labels: ConnectorTriggerPickerViewModel['labels'],
): string {
    switch (source) {
        case 'live':
            return labels.liveCatalogSource;
        case 'remote':
            return labels.remoteCatalogSource;
        default:
            return labels.bundledCatalogSource;
    }
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
