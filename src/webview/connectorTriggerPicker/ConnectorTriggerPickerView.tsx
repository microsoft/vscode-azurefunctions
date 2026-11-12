/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { Button, Combobox, Option } from '@fluentui/react-components';
import { useConfiguration, WebviewContext } from '@microsoft/vscode-azext-webview/webview';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent } from 'react';
import { ConnectorEventStep } from './ConnectorEventStep';
import { ConnectorTilePicker } from './ConnectorTilePicker';
import { partitionConnectorOptions, shouldExpandOtherConnectors } from './connectorTriggerGroups';
import { reconcileConnectorTriggerSelection } from './connectorTriggerPickerState';
import { ConnectorTriggerShell, type ConnectorTriggerStep } from './ConnectorTriggerShell';
import {
    isConnectorTriggerPickerResponse, type ConnectorTriggerAzureContextDisplay,
    type ConnectorTriggerLocationOption, type ConnectorTriggerOperationOption, type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel, type ConnectorTriggerSubscriptionOption,
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
    const [selectionUnavailable, setSelectionUnavailable] = useState(false);
    const [connectors, setConnectors] = useState<ConnectorTriggerOption[]>([]);
    const [operations, setOperations] = useState<ConnectorTriggerOperationOption[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [connectorSearch, setConnectorSearch] = useState('');
    const [connectorLimit, setConnectorLimit] = useState(connectorPageSize);
    const [otherConnectorsExpanded, setOtherConnectorsExpanded] = useState(false);
    const [selectedConnectorId, setSelectedConnectorId] = useState('');
    const [selectedOperationIds, setSelectedOperationIds] = useState<string[]>([]);
    const [operationsLoading, setOperationsLoading] = useState(false);
    const [operationsError, setOperationsError] = useState('');
    const [projectCreating, setProjectCreating] = useState(false);
    const [projectCreationDetail, setProjectCreationDetail] = useState('');
    const [projectCreationError, setProjectCreationError] = useState('');
    const [loadError, setLoadError] = useState<string>();

    const resetCatalog = useCallback(() => {
        setAzureContext(undefined);
        setCatalogLoaded(false);
        setCatalogLoading(false);
        setConnectors([]);
        setOperations([]);
        selectedConnectorIdRef.current = '';
        setSelectedConnectorId('');
        setSelectedOperationIds([]);
        setOperationsLoading(false);
        setOperationsError('');
        setSelectionUnavailable(false);
        setLoadError(undefined);
        setProjectCreationError('');
        setActiveStep(1);
    }, []);

    const initialize = useCallback(() => {
        setSubscriptionsLoading(true);
        setAzureContextMessage(undefined);
        setLoadError(undefined);
        vscodeApi.postMessage({ command: 'initialize' });
    }, [vscodeApi]);

    const selectSubscription = useCallback((subscriptionId: string) => {
        selectedSubscriptionIdRef.current = subscriptionId;
        setSelectedSubscriptionId(subscriptionId);
        setSelectedRegion('');
        setLocations([]);
        resetCatalog();
        setLocationsLoading(!!subscriptionId);
        if (subscriptionId) {
            vscodeApi.postMessage({ command: 'selectSubscription', subscriptionId });
        }
    }, [resetCatalog, vscodeApi]);

    const selectRegion = useCallback((region: string) => {
        setSelectedRegion(region);
        resetCatalog();
        if (selectedSubscriptionIdRef.current && region) {
            setCatalogLoading(true);
            vscodeApi.postMessage({
                command: 'selectRegion', subscriptionId: selectedSubscriptionIdRef.current, region,
            });
        }
    }, [resetCatalog, vscodeApi]);

    const loadOperations = useCallback((connectorId: string) => {
        setOperationsLoading(true);
        setOperationsError('');
        vscodeApi.postMessage({ command: 'loadConnectorOperations', connectorId });
    }, [vscodeApi]);

    const loadCatalog = () => {
        if (!azureContext) {
            initialize();
            return;
        }
        setCatalogLoading(true);
        setLoadError(undefined);
        vscodeApi.postMessage({ command: 'loadCatalog' });
    };

    const signIn = () => {
        if (!signInRequestPendingRef.current) {
            signInRequestPendingRef.current = true;
            setSubscriptionsLoading(true);
            setAzureContextMessage(undefined);
            vscodeApi.postMessage({ command: 'signIn' });
        }
    };

    useEffect(() => {
        const listener = (event: MessageEvent<unknown>) => {
            if (!isConnectorTriggerPickerResponse(event.data)) {
                return;
            }
            const message = event.data;
            if (message.command === 'azureContextRequired') {
                resetCatalog();
                selectedSubscriptionIdRef.current = '';
                signInRequestPendingRef.current = false;
                setSignInRequired(true);
                setShowingAllSubscriptions(false);
                setAzureContextMessage(message.message);
                setSubscriptions([]);
                setLocations([]);
                setSelectedSubscriptionId('');
                setSelectedRegion('');
                setSubscriptionsLoading(false);
                setLocationsLoading(false);
                setProjectCreating(false);
            } else if (message.command === 'subscriptionsLoaded') {
                signInRequestPendingRef.current = false;
                setSignInRequired(false);
                setShowingAllSubscriptions(message.showingAll);
                setSubscriptions(message.subscriptions);
                setSubscriptionsLoading(false);
                setAzureContextMessage(undefined);
                if (!shouldPreserveSubscriptionSelection(message.subscriptions, selectedSubscriptionIdRef.current)) {
                    selectSubscription(message.subscriptions[0]?.id ?? '');
                }
            } else if (message.command === 'locationsLoaded') {
                if (message.subscriptionId !== selectedSubscriptionIdRef.current) {
                    return;
                }
                setLocations(message.locations);
                setLocationsLoading(false);
                setAzureContextMessage(undefined);
                const groups = partitionConnectorLocations(message.locations);
                selectRegion(groups.recommended[0]?.name ?? groups.other[0]?.name ?? '');
            } else if (message.command === 'azureContextSelected') {
                if (message.azureContext.subscriptionId !== selectedSubscriptionIdRef.current) {
                    return;
                }
                setAzureContext(message.azureContext);
                setSelectedRegion(message.azureContext.region);
                setAzureContextMessage(undefined);
                setCatalogLoading(true);
            } else if (message.command === 'catalogLoaded') {
                setCatalogLoading(false);
                setCatalogLoaded(true);
                setConnectors(message.connectors);
                setOperations(message.operations);
                const connectorId = selectedConnectorIdRef.current;
                if (connectorId && message.connectors.some(connector => connector.id === connectorId)) {
                    loadOperations(connectorId);
                }
            } else if (message.command === 'connectorOperationsLoaded') {
                if (message.connectorId.toLowerCase() !== selectedConnectorIdRef.current.toLowerCase()) {
                    return;
                }
                setOperations(current => [
                    ...current.filter(operation => operation.connectorId.toLowerCase() !== message.connectorId.toLowerCase()),
                    ...message.operations,
                ]);
                setOperationsLoading(false);
                setOperationsError('');
            } else if (message.command === 'connectorOperationsFailed') {
                if (message.connectorId.toLowerCase() === selectedConnectorIdRef.current.toLowerCase()) {
                    setOperationsLoading(false);
                    setOperationsError(message.message);
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
            } else if (message.command === 'loadFailed') {
                if (message.scope === 'catalog') {
                    setCatalogLoading(false);
                    setLoadError(message.message);
                } else {
                    signInRequestPendingRef.current = false;
                    setSubscriptionsLoading(false);
                    setLocationsLoading(false);
                    setAzureContextMessage(message.message);
                }
            }
        };
        window.addEventListener('message', listener);
        initialize();
        return () => window.removeEventListener('message', listener);
    }, [initialize, loadOperations, resetCatalog, selectRegion, selectSubscription, viewModel.labels.creatingProject]);

    useEffect(() => { setConnectorLimit(connectorPageSize); }, [connectorSearch]);

    useEffect(() => {
        if (!catalogLoaded || catalogLoading || operationsLoading || operationsError) {
            return;
        }
        const reconciled = reconcileConnectorTriggerSelection({
            activeStep, connectorId: selectedConnectorId, operationIds: selectedOperationIds,
        }, connectors, operations);
        if (reconciled.selectionUnavailable) {
            setSelectionUnavailable(true);
        }
        if (reconciled.connectorId !== selectedConnectorId) {
            selectedConnectorIdRef.current = reconciled.connectorId;
            setSelectedConnectorId(reconciled.connectorId);
        }
        if (reconciled.operationIds.join('\0') !== selectedOperationIds.join('\0')) {
            setSelectedOperationIds(reconciled.operationIds);
        }
        if (reconciled.activeStep !== activeStep) {
            setActiveStep(reconciled.activeStep);
        }
    }, [activeStep, catalogLoaded, catalogLoading, connectors, operations, operationsError, operationsLoading, selectedConnectorId, selectedOperationIds]);

    const selectedConnector = connectors.find(connector => connector.id === selectedConnectorId);
    const connectorOperations = operations.filter(operation => operation.connectorId === selectedConnectorId);
    const filteredConnectors = useMemo(() => {
        const query = connectorSearch.trim().toLocaleLowerCase();
        return connectors.filter(connector => !query || connector.label.toLocaleLowerCase().includes(query) ||
            connector.description?.toLocaleLowerCase().includes(query));
    }, [connectorSearch, connectors]);
    const groups = useMemo(() => partitionConnectorOptions(filteredConnectors), [filteredConnectors]);
    const otherVisible = shouldExpandOtherConnectors(connectorSearch, otherConnectorsExpanded);
    const displayedOther = connectorSearch.trim() ? groups.other : groups.other.slice(0, connectorLimit);

    const selectConnector = (connectorId: string) => {
        if (connectorId !== selectedConnectorId) {
            setSelectedOperationIds([]);
            setProjectCreationError('');
        }
        selectedConnectorIdRef.current = connectorId;
        setSelectedConnectorId(connectorId);
        setSelectionUnavailable(false);
        setActiveStep(2);
        loadOperations(connectorId);
    };

    const selectOperation = (operationId: string) => {
        const operation = connectorOperations.find(item => item.id === operationId);
        if (!operation || operation.isWebhook) {
            return;
        }
        setSelectedOperationIds(current => current.includes(operationId) ?
            current.filter(id => id !== operationId) : [...current, operationId]);
        setSelectionUnavailable(false);
        setProjectCreationError('');
    };

    const useTemplate = () => {
        if (projectCreating || catalogLoading || operationsLoading || loadError || operationsError ||
            !azureContext || !selectedConnector || selectedOperationIds.length === 0 || selectionUnavailable) {
            return;
        }
        setProjectCreating(true);
        setProjectCreationDetail(viewModel.labels.creatingProject);
        setProjectCreationError('');
        vscodeApi.postMessage({ command: 'continue', connectorId: selectedConnector.id, operationIds: selectedOperationIds });
    };

    return (
        <main className="page">
            <fieldset disabled={projectCreating} className="picker-fields">
                <ConnectorTriggerShell activeStep={activeStep} canOpenEvent={!!selectedConnector} labels={viewModel.labels}
                    onBrowseTemplates={() => vscodeApi.postMessage({ command: 'browseTemplates' })}
                    onOpenCopilot={() => vscodeApi.postMessage({ command: 'openCopilot' })} onStepChange={setActiveStep} />
                {activeStep === 1 &&
                    <section className="step-page connector-page">
                        <h2>{viewModel.labels.connectorPageTitle}</h2>
                        <p className="step-description">{viewModel.labels.connectorPageDescription}</p>
                        <AzureContextFields labels={viewModel.labels} locations={locations} locationsLoading={locationsLoading}
                            selectedRegion={selectedRegion} selectedSubscriptionId={selectedSubscriptionId} signInRequired={signInRequired}
                            showingAllSubscriptions={showingAllSubscriptions} subscriptions={subscriptions} subscriptionsLoading={subscriptionsLoading}
                            onRequestSignIn={signIn} onSelectRegion={selectRegion} onSelectSubscription={selectSubscription}
                            onShowAllSubscriptions={() => { setSubscriptionsLoading(true); vscodeApi.postMessage({ command: 'loadAllSubscriptions' }); }}
                            onUseFilteredSubscriptions={() => { setSubscriptionsLoading(true); vscodeApi.postMessage({ command: 'loadFilteredSubscriptions' }); }} />
                        {azureContext &&
                            <div className="catalog-status azure-context-status">
                                <strong>{viewModel.labels.liveCatalogSource}</strong>
                                <span>{azureContext.subscriptionName} - {azureContext.regionDisplayName}</span>
                                {selectionUnavailable && <span className="warning-text">{viewModel.labels.selectionUnavailable}</span>}
                            </div>}
                        {!azureContext && azureContextMessage && (signInRequired ?
                            <p className="warning-text" role="status">{azureContextMessage}</p> :
                            <LoadError message={azureContextMessage} retryLabel={viewModel.labels.retry}
                                onRetry={() => selectedSubscriptionId ? selectSubscription(selectedSubscriptionId) : initialize()} />)}
                        {azureContext && <>
                            {loadError && <LoadError message={loadError} retryLabel={viewModel.labels.retry} onRetry={loadCatalog} />}
                            <label className="search-field">
                                <span className="codicon codicon-search" aria-hidden="true" />
                                <input value={connectorSearch} aria-label={viewModel.labels.connectorSearchPlaceholder}
                                    placeholder={viewModel.labels.connectorSearchPlaceholder} onChange={event => setConnectorSearch(event.target.value)} />
                            </label>
                            <div className="connector-list-heading">
                                <p className="result-count">{format(viewModel.labels.connectorCount, (groups.featured.length + groups.other.length).toString())}</p>
                                <Button appearance="subtle" disabled={catalogLoading} onClick={loadCatalog}>{viewModel.labels.retry}</Button>
                            </div>
                            {catalogLoading && <p className="status-text">{viewModel.labels.loadingConnectors}</p>}
                            {!catalogLoading && connectors.length === 0 && <p className="status-text">{viewModel.labels.noConnectors}</p>}
                            {groups.featured.length > 0 &&
                                <section className="featured-connectors">
                                    <h3>{viewModel.labels.featuredConnectors}</h3>
                                    <ConnectorTilePicker label={viewModel.labels.featuredConnectors} options={groups.featured}
                                        value={selectedConnectorId} onChange={selectConnector} />
                                </section>}
                            {groups.other.length > 0 &&
                                <section className="other-connectors">
                                    <button type="button" className="other-connectors-toggle" aria-controls="other-connectors-grid"
                                        aria-expanded={otherVisible} aria-label={otherVisible ? viewModel.labels.hideOtherConnectors : viewModel.labels.showOtherConnectors}
                                        disabled={!!connectorSearch.trim()} onClick={() => setOtherConnectorsExpanded(expanded => !expanded)}>
                                        <span className={`codicon codicon-chevron-${otherVisible ? 'down' : 'right'}`} aria-hidden="true" />
                                        {format(viewModel.labels.otherConnectors, groups.other.length.toString())}
                                    </button>
                                    {otherVisible && <div id="other-connectors-grid">
                                        <ConnectorTilePicker label={viewModel.labels.connectorGroup} options={displayedOther}
                                            value={selectedConnectorId} onChange={selectConnector} />
                                        {displayedOther.length < groups.other.length &&
                                            <Button appearance="secondary" className="show-more"
                                                onClick={() => setConnectorLimit(limit => limit + connectorPageSize)}>{viewModel.labels.showMoreConnectors}</Button>}
                                    </div>}
                                </section>}
                        </>}
                    </section>}
                {activeStep === 2 && selectedConnector &&
                    <ConnectorEventStep key={selectedConnector.id} connector={selectedConnector} labels={viewModel.labels}
                        operations={connectorOperations} operationsError={operationsError} operationsLoading={operationsLoading}
                        projectCreating={projectCreating} projectCreationDetail={projectCreationDetail} projectCreationError={projectCreationError}
                        selectedOperationIds={selectedOperationIds} templateUnavailable={selectionUnavailable || catalogLoading || !!loadError}
                        onChangeConnector={() => setActiveStep(1)} onSelectOperation={selectOperation}
                        onRetryOperations={() => loadOperations(selectedConnector.id)} onUseTemplate={useTemplate} />}
            </fieldset>
        </main>
    );
}

export function AzureContextFields({
    labels, locations, locationsLoading, selectedRegion, selectedSubscriptionId, signInRequired, showingAllSubscriptions,
    subscriptions, subscriptionsLoading, onRequestSignIn, onShowAllSubscriptions, onUseFilteredSubscriptions, onSelectRegion, onSelectSubscription,
}: {
    labels: ConnectorTriggerPickerViewModel['labels']; locations: readonly ConnectorTriggerLocationOption[];
    locationsLoading: boolean; selectedRegion: string; selectedSubscriptionId: string; signInRequired: boolean;
    showingAllSubscriptions: boolean; subscriptions: readonly ConnectorTriggerSubscriptionOption[]; subscriptionsLoading: boolean;
    onRequestSignIn: () => void; onShowAllSubscriptions: () => void; onUseFilteredSubscriptions: () => void;
    onSelectRegion: (region: string) => void; onSelectSubscription: (subscriptionId: string) => void;
}): JSX.Element {
    const selectedSubscription = subscriptions.find(subscription => subscription.id === selectedSubscriptionId);
    const [subscriptionQuery, setSubscriptionQuery] = useState(selectedSubscription?.label ?? '');
    useEffect(() => { setSubscriptionQuery(selectedSubscription?.label ?? ''); }, [selectedSubscription?.label]);
    const filteredSubscriptions = filterSubscriptionOptions(subscriptions, subscriptionQuery, selectedSubscriptionId);
    const modeActionLabel = getSubscriptionModeActionLabel(showingAllSubscriptions, labels);
    const locationGroups = partitionConnectorLocations(locations);
    const requestSignIn = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): void => {
        if (shouldRequestAzureSignIn(signInRequired, subscriptionsLoading)) {
            event.preventDefault();
            onRequestSignIn();
        }
    };
    return (
        <div className="azure-context-fields">
            <label>
                <span>{labels.subscription}</span>
                <Combobox aria-label={labels.subscription} className="subscription-combobox" disabled={subscriptionsLoading} inlinePopup
                    listbox={{ className: 'subscription-combobox-listbox' }}
                    placeholder={subscriptionsLoading ? labels.loadingSubscriptions : labels.selectSubscription}
                    selectedOptions={selectedSubscriptionId ? [selectedSubscriptionId] : []} value={subscriptionQuery}
                    onChange={event => setSubscriptionQuery(event.target.value)} onClick={requestSignIn}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { requestSignIn(event); } }}
                    onOpenChange={(_event, data) => { if (!data.open) { setSubscriptionQuery(selectedSubscription?.label ?? ''); } }}
                    onOptionSelect={(_event, data) => {
                        if (data.optionValue === showAllSubscriptionsValue) {
                            onShowAllSubscriptions();
                        } else if (data.optionValue === useFilteredSubscriptionsValue) {
                            onUseFilteredSubscriptions();
                        } else if (data.optionValue) {
                            onSelectSubscription(data.optionValue);
                        }
                        setSubscriptionQuery(selectedSubscription?.label ?? '');
                    }}>
                    {filteredSubscriptions.map(subscription =>
                        <Option key={subscription.id} text={`${subscription.label} ${subscription.id}`} value={subscription.id}>
                            <span className="subscription-option"><strong>{subscription.label}</strong><small>{subscription.id}</small></span>
                        </Option>)}
                    <Option text={modeActionLabel} value={showingAllSubscriptions ? useFilteredSubscriptionsValue : showAllSubscriptionsValue}>
                        {modeActionLabel}
                    </Option>
                </Combobox>
            </label>
            <label>
                <span>{labels.region}</span>
                <select disabled={!selectedSubscriptionId || locationsLoading} value={selectedRegion} onChange={event => onSelectRegion(event.target.value)}>
                    <option value="">{locationsLoading ? labels.loadingRegions : labels.selectRegion}</option>
                    {locationGroups.recommended.length > 0 &&
                        <optgroup label={labels.recommendedRegions}>
                            {locationGroups.recommended.map(location => <option key={location.name} value={location.name}>{location.label}</option>)}
                        </optgroup>}
                    {locationGroups.other.length > 0 &&
                        <optgroup label={labels.otherRegions}>
                            {locationGroups.other.map(location => <option key={location.name} value={location.name}>{location.label}</option>)}
                        </optgroup>}
                </select>
            </label>
        </div>
    );
}

export function partitionConnectorLocations(locations: readonly ConnectorTriggerLocationOption[]): {
    recommended: ConnectorTriggerLocationOption[]; other: ConnectorTriggerLocationOption[];
} {
    return {
        recommended: locations.filter(location => location.regionCategory?.toLowerCase() === 'recommended'),
        other: locations.filter(location => location.regionCategory?.toLowerCase() !== 'recommended'),
    };
}

export function shouldRequestAzureSignIn(signInRequired: boolean, subscriptionsLoading: boolean): boolean {
    return signInRequired && !subscriptionsLoading;
}

export function filterSubscriptionOptions(
    subscriptions: readonly ConnectorTriggerSubscriptionOption[], query: string, selectedSubscriptionId: string,
): ConnectorTriggerSubscriptionOption[] {
    const normalized = query.trim().toLocaleLowerCase();
    const selected = subscriptions.find(subscription => subscription.id === selectedSubscriptionId);
    return subscriptions.filter(subscription => !normalized || normalized === selected?.label.toLocaleLowerCase() ||
        subscription.label.toLocaleLowerCase().includes(normalized) || subscription.id.toLocaleLowerCase().includes(normalized));
}

export function getSubscriptionModeActionLabel(
    showingAllSubscriptions: boolean,
    labels: Pick<ConnectorTriggerPickerViewModel['labels'], 'showAllSubscriptions' | 'useFilteredSubscriptions'>,
): string {
    return showingAllSubscriptions ? labels.useFilteredSubscriptions : labels.showAllSubscriptions;
}

export function shouldPreserveSubscriptionSelection(subscriptions: readonly ConnectorTriggerSubscriptionOption[], selectedSubscriptionId: string): boolean {
    return !!selectedSubscriptionId && subscriptions.some(subscription => subscription.id === selectedSubscriptionId);
}

function format(template: string, ...values: string[]): string {
    return values.reduce((result, value, index) => result.replace(`{${index}}`, value), template);
}

function LoadError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }): JSX.Element {
    return <div className="load-error" role="alert"><p>{message}</p><Button appearance="secondary" onClick={onRetry}>{retryLabel}</Button></div>;
}
