/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { Button, Combobox, Option } from '@fluentui/react-components';
import { useConfiguration, WebviewContext } from '@microsoft/vscode-azext-webview/webview';
import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type JSX,
    type KeyboardEvent,
    type MouseEvent,
} from 'react';
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
    type ConnectorTriggerLocationOption,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
    type ConnectorTriggerSubscriptionOption,
} from './ConnectorTriggerPickerViewModel';

const connectorPageSize = 60;
const showAllSubscriptionsValue = '__showAllSubscriptions__';
const useFilteredSubscriptionsValue = '__useFilteredSubscriptions__';

export function ConnectorTriggerPickerView(): JSX.Element {
    const viewModel = useConfiguration<ConnectorTriggerPickerViewModel>();
    const { vscodeApi } = useContext(WebviewContext);
    const [activeStep, setActiveStep] = useState<ConnectorTriggerStep>(1);
    const [azureContext, setAzureContext] = useState<ConnectorTriggerAzureContextDisplay>();
    const [azureContextMessage, setAzureContextMessage] = useState<string>();
    const [subscriptions, setSubscriptions] = useState<ConnectorTriggerSubscriptionOption[]>([]);
    const [locations, setLocations] = useState<ConnectorTriggerLocationOption[]>([]);
    const [selectedSubscriptionId, setSelectedSubscriptionId] = useState('');
    const selectedSubscriptionIdRef = useRef('');
    const selectedConnectorIdRef = useRef('');
    const signInRequestPendingRef = useRef(false);
    const [selectedRegion, setSelectedRegion] = useState('');
    const [signInRequired, setSignInRequired] = useState(false);
    const [showingAllSubscriptions, setShowingAllSubscriptions] = useState(false);
    const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
    const [locationsLoading, setLocationsLoading] = useState(false);
    const [catalogLoaded, setCatalogLoaded] = useState(false);
    const [catalogWarning, setCatalogWarning] = useState<string>();
    const [selectionUnavailable, setSelectionUnavailable] = useState(false);
    const [connectors, setConnectors] = useState<ConnectorTriggerOption[]>([]);
    const [operations, setOperations] = useState<ConnectorTriggerOperationOption[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [connectorSearch, setConnectorSearch] = useState('');
    const [connectorLimit, setConnectorLimit] = useState(connectorPageSize);
    const [otherConnectorsExpanded, setOtherConnectorsExpanded] = useState(false);
    const [webhookOnlyConnectorsExpanded, setWebhookOnlyConnectorsExpanded] =
        useState(false);
    const [selectedConnectorId, setSelectedConnectorId] = useState('');
    const [selectedOperationId, setSelectedOperationId] = useState('');
    const [operationsLoading, setOperationsLoading] = useState(false);
    const [operationsError, setOperationsError] = useState('');
    const [projectCreating, setProjectCreating] = useState(false);
    const [projectCreationDetail, setProjectCreationDetail] = useState('');
    const [projectCreationError, setProjectCreationError] = useState('');
    const [loadError, setLoadError] = useState<string>();

    const initialize = useCallback(() => {
        setSubscriptionsLoading(true);
        setAzureContextMessage(undefined);
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

    const signIn = useCallback(() => {
        if (signInRequestPendingRef.current) {
            return;
        }
        signInRequestPendingRef.current = true;
        setSubscriptionsLoading(true);
        setAzureContextMessage(undefined);
        vscodeApi.postMessage({ command: 'signIn' });
    }, [vscodeApi]);

    const selectSubscription = useCallback((subscriptionId: string) => {
        selectedSubscriptionIdRef.current = subscriptionId;
        setSelectedSubscriptionId(subscriptionId);
        setSelectedRegion('');
        setLocations([]);
        setAzureContext(undefined);
        setCatalogLoaded(false);
        setCatalogWarning(undefined);
        setConnectors([]);
        setOperations([]);
        selectedConnectorIdRef.current = '';
        setSelectedConnectorId('');
        setSelectedOperationId('');
        setOperationsLoading(false);
        setOperationsError('');
        setLoadError(undefined);
        setProjectCreationError('');
        if (subscriptionId) {
            setLocationsLoading(true);
            vscodeApi.postMessage({
                command: 'selectSubscription',
                subscriptionId,
            });
        } else {
            setLocationsLoading(false);
        }
    }, [vscodeApi]);

    const loadAllSubscriptions = useCallback(() => {
        setSubscriptionsLoading(true);
        setAzureContextMessage(undefined);
        vscodeApi.postMessage({ command: 'loadAllSubscriptions' });
    }, [vscodeApi]);

    const loadFilteredSubscriptions = useCallback(() => {
        setSubscriptionsLoading(true);
        setAzureContextMessage(undefined);
        vscodeApi.postMessage({ command: 'loadFilteredSubscriptions' });
    }, [vscodeApi]);

    const selectRegion = useCallback((region: string) => {
        setSelectedRegion(region);
        setAzureContext(undefined);
        setCatalogLoaded(false);
        setCatalogWarning(undefined);
        setConnectors([]);
        setOperations([]);
        selectedConnectorIdRef.current = '';
        setSelectedConnectorId('');
        setSelectedOperationId('');
        setOperationsLoading(false);
        setOperationsError('');
        setLoadError(undefined);
        setProjectCreationError('');
        if (selectedSubscriptionId && region) {
            setCatalogLoading(true);
            vscodeApi.postMessage({
                command: 'selectRegion',
                subscriptionId: selectedSubscriptionId,
                region,
            });
        } else {
            setCatalogLoading(false);
        }
    }, [selectedSubscriptionId, vscodeApi]);

    useEffect(() => {
        const listener = (event: MessageEvent<unknown>) => {
            if (!isConnectorTriggerPickerResponse(event.data)) {
                return;
            }

            const message = event.data;
            if (message.command === 'azureContextRequired') {
                selectedSubscriptionIdRef.current = '';
                signInRequestPendingRef.current = false;
                setSignInRequired(true);
                setShowingAllSubscriptions(false);
                setAzureContext(undefined);
                setAzureContextMessage(message.message);
                setSubscriptions([]);
                setLocations([]);
                setSelectedSubscriptionId('');
                setSelectedRegion('');
                setSubscriptionsLoading(false);
                setLocationsLoading(false);
                setCatalogLoaded(false);
                setCatalogWarning(undefined);
                setSelectionUnavailable(false);
                setConnectors([]);
                setOperations([]);
                setCatalogLoading(false);
                setConnectorSearch('');
                setConnectorLimit(connectorPageSize);
                setOtherConnectorsExpanded(false);
                setSelectedConnectorId('');
                setSelectedOperationId('');
                selectedConnectorIdRef.current = '';
                setOperationsLoading(false);
                setOperationsError('');
                setProjectCreating(false);
                setProjectCreationDetail('');
                setProjectCreationError('');
                setLoadError(undefined);
                setActiveStep(1);
            } else if (message.command === 'subscriptionsLoaded') {
                signInRequestPendingRef.current = false;
                setSignInRequired(false);
                setShowingAllSubscriptions(message.showingAll);
                const preservesSelection = shouldPreserveSubscriptionSelection(
                    message.subscriptions,
                    selectedSubscriptionIdRef.current,
                );
                setSubscriptions(message.subscriptions);
                setSubscriptionsLoading(false);
                if (preservesSelection) {
                    return;
                }
                selectedSubscriptionIdRef.current = '';
                setAzureContext(undefined);
                setAzureContextMessage(undefined);
                setLocations([]);
                setSelectedSubscriptionId('');
                setSelectedRegion('');
                setSubscriptionsLoading(false);
                setLocationsLoading(false);
                setCatalogLoaded(false);
                setCatalogWarning(undefined);
                setSelectionUnavailable(false);
                setConnectors([]);
                setOperations([]);
                setCatalogLoading(false);
                setSelectedConnectorId('');
                setSelectedOperationId('');
                selectedConnectorIdRef.current = '';
                setOperationsLoading(false);
                setOperationsError('');
                setLoadError(undefined);
                setActiveStep(1);
            } else if (message.command === 'locationsLoaded') {
                if (message.subscriptionId !== selectedSubscriptionIdRef.current) {
                    return;
                }
                setLocations(message.locations);
                setLocationsLoading(false);
                setAzureContextMessage(undefined);
            } else if (message.command === 'azureContextSelected') {
                selectedSubscriptionIdRef.current = message.azureContext.subscriptionId;
                setAzureContext(message.azureContext);
                setSelectedSubscriptionId(message.azureContext.subscriptionId);
                setSelectedRegion(message.azureContext.region);
                setAzureContextMessage(undefined);
                setCatalogLoading(true);
                setLoadError(undefined);
                setCatalogLoaded(false);
                setConnectors([]);
                setOperations([]);
                setSelectedConnectorId('');
                setSelectedOperationId('');
                selectedConnectorIdRef.current = '';
                setOperationsLoading(false);
                setOperationsError('');
                setActiveStep(1);
            } else if (message.command === 'catalogLoaded') {
                setCatalogLoading(false);
                setCatalogLoaded(true);
                setCatalogWarning(message.warning);
                setConnectors(message.connectors);
                setOperations(message.operations);
            } else if (message.command === 'connectorOperationsLoaded') {
                if (!equalsIgnoreCase(
                    message.connectorId,
                    selectedConnectorIdRef.current,
                )) {
                    return;
                }
                setOperations(current => [
                    ...current.filter(operation =>
                        !equalsIgnoreCase(operation.connectorId, message.connectorId)),
                    ...message.operations,
                ]);
                setConnectors(current => current.map(connector =>
                    equalsIgnoreCase(connector.id, message.connectorId) ?
                        {
                            ...connector,
                            eventSupport: message.eventSupport,
                        } :
                        connector));
                setOperationsLoading(false);
                setOperationsError('');
            } else if (message.command === 'connectorOperationsFailed') {
                if (!equalsIgnoreCase(
                    message.connectorId,
                    selectedConnectorIdRef.current,
                )) {
                    return;
                }
                setOperationsLoading(false);
                setOperationsError(message.message);
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
                if (message.scope === 'catalog') {
                    setCatalogLoading(false);
                    setLoadError(message.message);
                } else if (message.scope === 'locations') {
                    setSignInRequired(false);
                    setLocationsLoading(false);
                    setAzureContextMessage(message.message);
                } else {
                    signInRequestPendingRef.current = false;
                    setSignInRequired(false);
                    setSubscriptionsLoading(false);
                    setAzureContextMessage(message.message);
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
        if (!catalogLoaded) {
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
        catalogLoaded,
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
    const connectorSearchActive = !!connectorSearch.trim();
    const classifiedConnectorCount = connectors.filter(connector =>
        connector.eventSupport &&
        connector.eventSupport !== 'unknown').length;
    const webhookOnlyConnectorsVisible = shouldExpandOtherConnectors(
        connectorSearch,
        webhookOnlyConnectorsExpanded,
    );

    const selectConnector = (connectorId: string) => {
        if (connectors.find(connector =>
            connector.id === connectorId)?.availability === 'unavailable') {
            return;
        }

        if (connectorId !== selectedConnectorId) {
            setSelectedOperationId('');
            setProjectCreationError('');
        }
        selectedConnectorIdRef.current = connectorId;
        setSelectedConnectorId(connectorId);
        setOperationsLoading(true);
        setOperationsError('');
        setActiveStep(2);
        vscodeApi.postMessage({
            command: 'loadConnectorOperations',
            connectorId,
        });
    };

    const retryConnectorOperations = () => {
        if (!selectedConnectorId) {
            return;
        }
        setOperationsLoading(true);
        setOperationsError('');
        vscodeApi.postMessage({
            command: 'loadConnectorOperations',
            connectorId: selectedConnectorId,
        });
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

            {activeStep === 1 &&
                <section className="step-page connector-page">
                    <h2>{viewModel.labels.connectorPageTitle}</h2>
                    <p className="step-description">{viewModel.labels.connectorPageDescription}</p>

                    <AzureContextFields
                        labels={viewModel.labels}
                        locations={locations}
                        locationsLoading={locationsLoading}
                        selectedRegion={selectedRegion}
                        selectedSubscriptionId={selectedSubscriptionId}
                        signInRequired={signInRequired}
                        showingAllSubscriptions={showingAllSubscriptions}
                        subscriptions={subscriptions}
                        subscriptionsLoading={subscriptionsLoading}
                        onRequestSignIn={signIn}
                        onShowAllSubscriptions={loadAllSubscriptions}
                        onUseFilteredSubscriptions={loadFilteredSubscriptions}
                        onSelectRegion={selectRegion}
                        onSelectSubscription={selectSubscription}
                    />

                    {azureContext &&
                        <div className="catalog-status azure-context-status">
                            <strong>{viewModel.labels.liveCatalogSource}</strong>
                            <span>
                                {azureContext.subscriptionName} · {azureContext.regionDisplayName}
                            </span>
                            {catalogWarning &&
                                <span className="warning-text">{catalogWarning}</span>
                            }
                            {selectionUnavailable &&
                                <span className="warning-text">
                                    {viewModel.labels.selectionUnavailable}
                                </span>
                            }
                        </div>
                    }

                    {!azureContext && azureContextMessage &&
                        (signInRequired ?
                            <p className="warning-text" role="status">
                                {azureContextMessage}
                            </p> :
                            <LoadError
                                message={azureContextMessage}
                                retryLabel={viewModel.labels.retry}
                                onRetry={() => selectedSubscriptionId ?
                                    selectSubscription(selectedSubscriptionId) :
                                    initialize()}
                            />
                        )
                    }

                    {!azureContext ? null :
                        catalogLoading && connectors.length === 0 ?
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
                                        <WebhookOnlyConnectorGroup
                                            classifiedConnectorCount={classifiedConnectorCount}
                                            expanded={webhookOnlyConnectorsVisible}
                                            labels={viewModel.labels}
                                            options={connectorGroups.webhookOnly}
                                            searchActive={connectorSearchActive}
                                            value={selectedConnectorId}
                                            onChange={selectConnector}
                                            onToggle={() => setWebhookOnlyConnectorsExpanded(
                                                expanded => !expanded,
                                            )}
                                        />
                                    </>
                    }
                </section>
            }

            {activeStep === 2 && selectedConnector &&
                <ConnectorEventStep
                    connector={selectedConnector}
                    labels={viewModel.labels}
                    operations={connectorOperations}
                    operationsError={operationsError}
                    operationsLoading={operationsLoading}
                    projectCreating={projectCreating}
                    projectCreationDetail={projectCreationDetail}
                    projectCreationError={projectCreationError}
                    selectedOperationId={selectedOperationId}
                    templateUnavailable={selectedCatalogItemUnavailable}
                    webhookOnly={selectedConnector.eventSupport === 'webhook-only'}
                    onChangeConnector={() => setActiveStep(1)}
                    onSelectOperation={selectOperation}
                    onRetryOperations={retryConnectorOperations}
                    onUseTemplate={useTemplate}
                />
            }
        </main>
    );
}

export function WebhookOnlyConnectorGroup({
    classifiedConnectorCount,
    expanded,
    labels,
    options,
    searchActive,
    value,
    onChange,
    onToggle,
}: {
    classifiedConnectorCount: number;
    expanded: boolean;
    labels: ConnectorTriggerPickerViewModel['labels'];
    options: readonly ConnectorTriggerOption[];
    searchActive: boolean;
    value: string;
    onChange: (value: string) => void;
    onToggle: () => void;
}): JSX.Element {
    const emptyMessage = searchActive ?
        labels.webhookNoSearchResults :
        classifiedConnectorCount > 0 ?
            labels.webhookNoneLoaded :
            labels.webhookDiscoveryDescription;
    return (
        <section className="other-connectors webhook-only-connectors">
            <button
                type="button"
                className="other-connectors-toggle"
                aria-controls="webhook-only-connectors-grid"
                aria-expanded={expanded}
                aria-label={expanded ?
                    labels.hideWebhookOnlyConnectors :
                    labels.showWebhookOnlyConnectors}
                disabled={searchActive}
                onClick={onToggle}
            >
                <span
                    className={`codicon codicon-chevron-${expanded ? 'down' : 'right'}`}
                    aria-hidden="true"
                />
                {format(
                    labels.webhookOnlyConnectors,
                    options.length.toString(),
                )}
            </button>
            {expanded &&
                <div id="webhook-only-connectors-grid">
                    {options.length > 0 ?
                        <ConnectorTilePicker
                            label={labels.webhookOnlyConnectors}
                            options={options}
                            unavailableLabel={labels.unavailable}
                            value={value}
                            onChange={onChange}
                        /> :
                        <p className="status-text" role="status">
                            {emptyMessage}
                        </p>
                    }
                </div>
            }
        </section>
    );
}

export function AzureContextFields({
    labels,
    locations,
    locationsLoading,
    selectedRegion,
    selectedSubscriptionId,
    signInRequired,
    showingAllSubscriptions,
    subscriptions,
    subscriptionsLoading,
    onRequestSignIn,
    onShowAllSubscriptions,
    onUseFilteredSubscriptions,
    onSelectRegion,
    onSelectSubscription,
}: {
    labels: ConnectorTriggerPickerViewModel['labels'];
    locations: readonly ConnectorTriggerLocationOption[];
    locationsLoading: boolean;
    selectedRegion: string;
    selectedSubscriptionId: string;
    signInRequired: boolean;
    showingAllSubscriptions: boolean;
    subscriptions: readonly ConnectorTriggerSubscriptionOption[];
    subscriptionsLoading: boolean;
    onRequestSignIn: () => void;
    onShowAllSubscriptions: () => void;
    onUseFilteredSubscriptions: () => void;
    onSelectRegion: (region: string) => void;
    onSelectSubscription: (subscriptionId: string) => void;
}): JSX.Element {
    const selectedSubscription = subscriptions.find(subscription =>
        subscription.id === selectedSubscriptionId);
    const [subscriptionQuery, setSubscriptionQuery] = useState(
        selectedSubscription?.label ?? '',
    );
    useEffect(() => {
        setSubscriptionQuery(selectedSubscription?.label ?? '');
    }, [selectedSubscription?.label]);
    const filteredSubscriptions = filterSubscriptionOptions(
        subscriptions,
        subscriptionQuery,
        selectedSubscriptionId,
    );
    const modeActionLabel = getSubscriptionModeActionLabel(
        showingAllSubscriptions,
        labels,
    );
    const requestSignIn = (
        event: MouseEvent<HTMLElement> |
        KeyboardEvent<HTMLElement>,
    ): void => {
        if (!shouldRequestAzureSignIn(signInRequired, subscriptionsLoading)) {
            return;
        }
        event.preventDefault();
        onRequestSignIn();
    };

    return (
        <div className="azure-context-fields">
            <label>
                <span>{labels.subscription}</span>
                <Combobox
                    aria-label={labels.subscription}
                    className="subscription-combobox"
                    disabled={subscriptionsLoading}
                    inlinePopup
                    listbox={{
                        className: 'subscription-combobox-listbox',
                    }}
                    placeholder={subscriptionsLoading ?
                        labels.loadingSubscriptions :
                        labels.selectSubscription}
                    selectedOptions={selectedSubscriptionId ?
                        [selectedSubscriptionId] :
                        []}
                    value={subscriptionQuery}
                    onChange={event => setSubscriptionQuery(event.target.value)}
                    onClick={requestSignIn}
                    onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            requestSignIn(event);
                        }
                    }}
                    onOpenChange={(_event, data) => {
                        if (!data.open) {
                            setSubscriptionQuery(selectedSubscription?.label ?? '');
                        }
                    }}
                    onOptionSelect={(_event, data) => {
                        if (data.optionValue === showAllSubscriptionsValue) {
                            onShowAllSubscriptions();
                            setSubscriptionQuery(selectedSubscription?.label ?? '');
                        } else if (data.optionValue === useFilteredSubscriptionsValue) {
                            onUseFilteredSubscriptions();
                            setSubscriptionQuery(selectedSubscription?.label ?? '');
                        } else if (data.optionValue) {
                            const subscription = subscriptions.find(option =>
                                option.id === data.optionValue);
                            setSubscriptionQuery(subscription?.label ?? '');
                            onSelectSubscription(data.optionValue);
                        }
                    }}
                >
                    {filteredSubscriptions.map(subscription =>
                        <Option
                            key={subscription.id}
                            text={`${subscription.label} ${subscription.id}`}
                            value={subscription.id}
                        >
                            <span className="subscription-option">
                                <strong>{subscription.label}</strong>
                                <small>{subscription.id}</small>
                            </span>
                        </Option>
                    )}
                    {!showingAllSubscriptions ?
                        <Option
                            text={modeActionLabel}
                            value={showAllSubscriptionsValue}
                        >
                            {modeActionLabel}
                        </Option> :
                        <Option
                            text={modeActionLabel}
                            value={useFilteredSubscriptionsValue}
                        >
                            {modeActionLabel}
                        </Option>
                    }
                </Combobox>
            </label>
            <label>
                <span>{labels.region}</span>
                <select
                    disabled={!selectedSubscriptionId || locationsLoading}
                    value={selectedRegion}
                    onChange={event => onSelectRegion(event.target.value)}
                >
                    <option value="">
                        {locationsLoading ? labels.loadingRegions : labels.selectRegion}
                    </option>
                    {locations.map(location =>
                        <option key={location.name} value={location.name}>
                            {location.label}
                        </option>
                    )}
                </select>
            </label>
        </div>
    );
}

export function shouldRequestAzureSignIn(
    signInRequired: boolean,
    subscriptionsLoading: boolean,
): boolean {
    return signInRequired && !subscriptionsLoading;
}

export function filterSubscriptionOptions(
    subscriptions: readonly ConnectorTriggerSubscriptionOption[],
    query: string,
    selectedSubscriptionId: string,
): ConnectorTriggerSubscriptionOption[] {
    const normalized = query.trim().toLocaleLowerCase();
    const selected = subscriptions.find(subscription =>
        subscription.id === selectedSubscriptionId);
    if (!normalized || normalized === selected?.label.toLocaleLowerCase()) {
        return [...subscriptions];
    }

    return subscriptions.filter(subscription =>
        subscription.label.toLocaleLowerCase().includes(normalized) ||
        subscription.id.toLocaleLowerCase().includes(normalized));
}

export function getSubscriptionModeActionLabel(
    showingAllSubscriptions: boolean,
    labels: Pick<
        ConnectorTriggerPickerViewModel['labels'],
        'showAllSubscriptions' | 'useFilteredSubscriptions'
    >,
): string {
    return showingAllSubscriptions ?
        labels.useFilteredSubscriptions :
        labels.showAllSubscriptions;
}

export function shouldPreserveSubscriptionSelection(
    subscriptions: readonly ConnectorTriggerSubscriptionOption[],
    selectedSubscriptionId: string,
): boolean {
    return !!selectedSubscriptionId &&
        subscriptions.some(subscription =>
            subscription.id === selectedSubscriptionId);
}

function equalsIgnoreCase(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
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
