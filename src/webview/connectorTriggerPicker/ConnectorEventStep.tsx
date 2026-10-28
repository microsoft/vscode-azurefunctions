/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button } from '@fluentui/react-components';
import { useMemo, useState, type JSX } from 'react';
import { ConnectorBrandIcon } from './ConnectorBrandIcon';
import {
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
} from './ConnectorTriggerPickerViewModel';

interface ConnectorEventStepProps {
    connector: ConnectorTriggerOption;
    labels: ConnectorTriggerPickerViewModel['labels'];
    operations: ConnectorTriggerOperationOption[];
    selectedOperationId: string;
    onChangeConnector: () => void;
    onSelectOperation: (operationId: string) => void;
}

export function ConnectorEventStep({
    connector,
    labels,
    operations,
    selectedOperationId,
    onChangeConnector,
    onSelectOperation,
}: ConnectorEventStepProps): JSX.Element {
    const [search, setSearch] = useState('');
    const filteredOperations = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        if (!query) {
            return operations;
        }

        return operations.filter(operation =>
            operation.label.toLocaleLowerCase().includes(query) ||
            operation.description?.toLocaleLowerCase().includes(query));
    }, [operations, search]);
    const selectedOperation = operations.find(operation => operation.id === selectedOperationId);
    const countText = format(labels.eventCount, filteredOperations.length.toString(), operations.length.toString());

    return (
        <section className="step-page">
            <h2>{labels.eventPageTitle}</h2>
            <p className="step-description">{labels.eventPageDescription}</p>

            <div className="selection-summary connector-summary">
                <ConnectorBrandIcon connector={connector} size={24} />
                <strong>{connector.label}</strong>
                <Button
                    appearance="subtle"
                    icon={<span className="codicon codicon-arrow-swap" aria-hidden="true" />}
                    onClick={onChangeConnector}
                >
                    {labels.changeConnector}
                </Button>
            </div>

            <label className="search-field">
                <span className="codicon codicon-search" aria-hidden="true" />
                <input
                    value={search}
                    placeholder={labels.eventSearchPlaceholder}
                    onChange={event => setSearch(event.target.value)}
                />
            </label>

            <p className="result-count">
                {countText}
                {selectedOperation ? ` ${format(labels.eventSelected, selectedOperation.label)}` : ''}
            </p>

            {filteredOperations.length === 0 ?
                <p className="status-text">{labels.noTriggers}</p> :
                <div className="event-list">
                    {filteredOperations.map(operation =>
                        <button
                            key={operation.id}
                            type="button"
                            className={`event-card${selectedOperationId === operation.id ? ' selected' : ''}`}
                            onClick={() => onSelectOperation(operation.id)}
                        >
                            <span>
                                <strong>{operation.label}</strong>
                                {operation.description && <small>{operation.description}</small>}
                            </span>
                            <span className="codicon codicon-chevron-right" aria-hidden="true" />
                        </button>
                    )}
                </div>
            }
        </section>
    );
}

function format(template: string, ...values: string[]): string {
    return values.reduce(
        (result, value, index) => result.replace(`{${index}}`, value),
        template,
    );
}
