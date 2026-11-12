/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button } from '@fluentui/react-components';
import { useMemo, useState, type JSX } from 'react';
import { ConnectorBrandIcon } from './ConnectorBrandIcon';
import { type ConnectorTriggerOperationOption, type ConnectorTriggerOption, type ConnectorTriggerPickerViewModel } from './ConnectorTriggerPickerViewModel';

interface ConnectorEventStepProps {
    connector: ConnectorTriggerOption;
    labels: ConnectorTriggerPickerViewModel['labels'];
    operations: ConnectorTriggerOperationOption[];
    operationsError: string;
    operationsLoading: boolean;
    projectCreating: boolean;
    projectCreationDetail: string;
    projectCreationError: string;
    selectedOperationIds: string[];
    templateUnavailable: boolean;
    onChangeConnector: () => void;
    onRetryOperations: () => void;
    onSelectOperation: (operationId: string) => void;
    onUseTemplate: () => void;
}

export function ConnectorEventStep({
    connector, labels, operations, operationsError, operationsLoading, projectCreating,
    projectCreationDetail, projectCreationError, selectedOperationIds, templateUnavailable,
    onChangeConnector, onRetryOperations, onSelectOperation, onUseTemplate,
}: ConnectorEventStepProps): JSX.Element {
    const [search, setSearch] = useState('');
    const filteredOperations = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return operations.filter(operation => !query ||
            operation.label.toLocaleLowerCase().includes(query) ||
            operation.description?.toLocaleLowerCase().includes(query));
    }, [operations, search]);
    const hasNoTriggers = !operationsLoading && !operationsError && operations.length === 0;

    return (
        <section className="step-page">
            <h2>{labels.eventPageTitle}</h2>
            <p className="step-description">{labels.eventPageDescription}</p>
            <div className="selection-summary connector-summary">
                <ConnectorBrandIcon connector={connector} size={24} />
                <strong>{connector.label}</strong>
                <Button appearance="subtle" disabled={projectCreating}
                    icon={<span className="codicon codicon-arrow-swap" aria-hidden="true" />} onClick={onChangeConnector}>
                    {labels.changeConnector}
                </Button>
            </div>
            {!hasNoTriggers && <>
                <label className="search-field">
                    <span className="codicon codicon-search" aria-hidden="true" />
                    <input value={search} aria-label={labels.eventSearchPlaceholder} placeholder={labels.eventSearchPlaceholder}
                        disabled={projectCreating} onChange={event => setSearch(event.target.value)} />
                </label>
                <p className="result-count" role="status">
                    {format(labels.eventCount, filteredOperations.length.toString(), operations.length.toString())}
                    {' '}{format(labels.eventSelected, selectedOperationIds.length.toString())}
                </p>
            </>}
            {operationsLoading ? <p className="status-text">{labels.loadingEvents}</p> :
                operationsError ?
                    <div className="load-error" role="alert">
                        <p>{operationsError}</p>
                        <Button appearance="secondary" onClick={onRetryOperations}>{labels.retry}</Button>
                    </div> :
                    hasNoTriggers ?
                        <p className="status-text" role="status">{format(labels.noTriggers, connector.label)}</p> :
                    filteredOperations.length === 0 ? <p className="status-text">{labels.noMatchingEvents}</p> :
                        <div className="event-list" role="group" aria-label={labels.eventStep}>
                            {filteredOperations.map(operation => {
                                const disabled = operation.availability === 'unavailable' || operation.isWebhook;
                                return (
                                    <label key={operation.id}
                                        className={`event-card${selectedOperationIds.includes(operation.id) ? ' selected' : ''}${operation.isWebhook ? ' webhook' : ''}${disabled ? ' unavailable' : ''}`}>
                                        <input type="checkbox" checked={selectedOperationIds.includes(operation.id)}
                                            disabled={projectCreating || disabled} aria-label={operation.label}
                                            onChange={() => onSelectOperation(operation.id)} />
                                        <span>
                                            <strong>{operation.label}</strong>
                                            {operation.description && <small>{operation.description}</small>}
                                            <small className={operation.isWebhook ? 'warning-text' : undefined}>
                                                {operation.isWebhook ? labels.webhookEventDelivery : labels.pollingEventDelivery}
                                            </small>
                                            {operation.availability === 'unavailable' && <small>{labels.unavailable}</small>}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>}
            <div className="event-selection-actions">
                <span>
                    {projectCreationError && <small className="project-creation-error" role="alert">{projectCreationError}</small>}
                    {templateUnavailable && <small className="warning-text" role="status">{labels.selectionUnavailable}</small>}
                    {projectCreating && <small role="status">{projectCreationDetail || labels.creatingProject}</small>}
                </span>
                <Button appearance="primary"
                    disabled={projectCreating || operationsLoading || !!operationsError || templateUnavailable || selectedOperationIds.length === 0}
                    onClick={onUseTemplate}>
                    {projectCreating ? labels.creatingProject : labels.useTemplate}
                </Button>
            </div>
        </section>
    );
}

function format(template: string, ...values: string[]): string {
    return values.reduce((result, value, index) => result.replace(`{${index}}`, value), template);
}
