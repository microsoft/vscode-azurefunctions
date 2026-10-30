/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button } from '@fluentui/react-components';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { ConnectorBrandIcon } from './ConnectorBrandIcon';
import {
    type ConnectorTriggerCatalogSource,
    type ConnectorDeliveryMode,
    type ConnectorNamespaceOption,
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
} from './ConnectorTriggerPickerViewModel';

interface ConnectorConfigureStepProps {
    catalogLoading: boolean;
    catalogSource: ConnectorTriggerCatalogSource;
    connector: ConnectorTriggerOption;
    deliveryMode: ConnectorDeliveryMode;
    labels: ConnectorTriggerPickerViewModel['labels'];
    language?: string;
    namespace?: ConnectorNamespaceOption;
    operation: ConnectorTriggerOperationOption;
    operationInputsError: string;
    operationInputsDeferred: boolean;
    operationInputsLoading: boolean;
    projectCreating: boolean;
    projectCreationDetail: string;
    projectCreationError: string;
    templateUnavailable: boolean;
    onChangeDeliveryMode: (deliveryMode: ConnectorDeliveryMode) => void;
    onChangeEvent: () => void;
    onRetryOperationInputs: () => void;
    onUseTemplate: () => void;
}

export function ConnectorConfigureStep({
    catalogLoading,
    catalogSource,
    connector,
    deliveryMode,
    labels,
    language,
    namespace,
    operation,
    operationInputsError,
    operationInputsDeferred,
    operationInputsLoading,
    projectCreating,
    projectCreationDetail,
    projectCreationError,
    templateUnavailable,
    onChangeDeliveryMode,
    onChangeEvent,
    onRetryOperationInputs,
    onUseTemplate,
}: ConnectorConfigureStepProps): JSX.Element {
    const [previewTab, setPreviewTab] = useState<'trigger' | 'resources'>('trigger');
    const [inputValues, setInputValues] = useState<Record<string, string | boolean>>({});
    const [optionalParametersExpanded, setOptionalParametersExpanded] = useState(false);
    const support = getDeliverySupport(operation);
    const inputDefinitions = operation.inputDefinitions;
    const parameterGroups = useMemo(
        () => partitionEventParameters(inputDefinitions ?? []),
        [inputDefinitions],
    );
    const triggerMetadata = useMemo(() => JSON.stringify({
        language: language || 'selected project language',
        catalogSource,
        connector: connector.id,
        trigger: operation.id,
        deliveryMode,
        ...(namespace ? { connectorNamespace: namespace.name } : {}),
    }, null, 2), [catalogSource, connector.id, deliveryMode, language, namespace, operation.id]);
    const resourceMetadata = useMemo(() => JSON.stringify(namespace ? {
        subscription: namespace.subscriptionName,
        resourceGroup: namespace.resourceGroup,
        location: namespace.location,
        connectorNamespace: namespace.name,
    } : {
        catalogSource,
        azureSetup: labels.resourceSetupDeferred,
    }, null, 2), [catalogSource, labels.resourceSetupDeferred, namespace]);

    useEffect(() => {
        const initialValues: Record<string, string | boolean> = {};
        for (const input of inputDefinitions ?? []) {
            if (input.defaultValue !== undefined && !input.sensitive) {
                initialValues[input.name] = typeof input.defaultValue === 'boolean' ?
                    input.defaultValue :
                    String(input.defaultValue);
            }
        }
        setInputValues(initialValues);
        setOptionalParametersExpanded(false);
    }, [inputDefinitions, operation.id]);

    return (
        <section className="step-page configure-page">
            <h2>{labels.configurePageTitle}</h2>
            <p className="step-description">{labels.configurePageDescription}</p>

            <div className="selection-summary configure-summary">
                <ConnectorBrandIcon connector={connector} size={24} />
                <span>
                    <strong>{connector.label}</strong>
                    <b>{operation.label}</b>
                    {operation.description && <small>{operation.description}</small>}
                </span>
                <Button
                    appearance="subtle"
                    icon={<span className="codicon codicon-arrow-swap" aria-hidden="true" />}
                    onClick={onChangeEvent}
                >
                    {labels.changeEvent}
                </Button>
            </div>

            <div className="delivery-field">
                <strong>{labels.deliveryQuestion}</strong>
                <div className="delivery-controls">
                    <Button
                        appearance={deliveryMode === 'Polling' ? 'primary' : 'secondary'}
                        disabled={!support.polling}
                        onClick={() => onChangeDeliveryMode('Polling')}
                    >
                        {labels.polling}
                    </Button>
                    <Button
                        appearance={deliveryMode === 'Webhook' ? 'primary' : 'secondary'}
                        disabled={!support.webhook}
                        title={labels.webhookDescription}
                        onClick={() => onChangeDeliveryMode('Webhook')}
                    >
                        {labels.webhook}
                    </Button>
                    <span>
                        {deliveryMode === 'Polling' ?
                            labels.pollingDescription :
                            labels.webhookDescription}
                    </span>
                </div>
            </div>

            <div className="event-parameters">
                <h3>{labels.eventParameters}</h3>
                <p>{labels.eventParametersDescription}</p>
                {operationInputsLoading ||
                    inputDefinitions === undefined && !operationInputsError ?
                    <p className="status-text">
                        {operationInputsDeferred ?
                            labels.eventParametersDeferred :
                            labels.loadingEventParameters}
                    </p> :
                    operationInputsError ?
                        <div className="load-error" role="alert">
                            <p>{operationInputsError}</p>
                            <Button appearance="secondary" onClick={onRetryOperationInputs}>
                                {labels.retry}
                            </Button>
                        </div> :
                        inputDefinitions?.length === 0 ?
                            <p className="status-text">{labels.noEventParameters}</p> :
                            <>
                                {parameterGroups.primary.length > 0 &&
                                    <EventParameterGrid
                                        idPrefix="connector-event-parameter"
                                        inputs={parameterGroups.primary}
                                        inputValues={inputValues}
                                        labels={labels}
                                        setInputValue={(name, value) => setInputValues(current => ({
                                            ...current,
                                            [name]: value,
                                        }))}
                                    />
                                }
                                {parameterGroups.optional.length > 0 &&
                                    <div className="optional-event-parameters">
                                        <button
                                            type="button"
                                            className="optional-event-parameters-toggle"
                                            aria-controls="optional-event-parameters-grid"
                                            aria-expanded={optionalParametersExpanded}
                                            aria-label={optionalParametersExpanded ?
                                                labels.hideOptionalParameters :
                                                labels.showOptionalParameters}
                                            onClick={() => setOptionalParametersExpanded(expanded => !expanded)}
                                        >
                                            <span
                                                className={`codicon codicon-chevron-${optionalParametersExpanded ? 'down' : 'right'}`}
                                                aria-hidden="true"
                                            />
                                            {format(
                                                labels.optionalParameters,
                                                parameterGroups.optional.length.toString(),
                                            )}
                                        </button>
                                        {optionalParametersExpanded &&
                                            <div id="optional-event-parameters-grid">
                                                <EventParameterGrid
                                                    idPrefix="connector-optional-event-parameter"
                                                    inputs={parameterGroups.optional}
                                                    inputValues={inputValues}
                                                    labels={labels}
                                                    setInputValue={(name, value) => setInputValues(current => ({
                                                        ...current,
                                                        [name]: value,
                                                    }))}
                                                />
                                            </div>
                                        }
                                    </div>
                                }
                            </>
                }
            </div>

            <p className="setup-deferred-note">{labels.catalogSetupDeferred}</p>

            <div className="preview-panel">
                <div className="preview-callout">
                    <strong>{labels.selectionPreview}</strong>
                    <p>{connector.label} · {operation.label} · {deliveryMode}</p>
                </div>
                <div className="preview-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={previewTab === 'trigger'}
                        className={previewTab === 'trigger' ? 'active' : ''}
                        onClick={() => setPreviewTab('trigger')}
                    >
                        <span className="codicon codicon-symbol-property" aria-hidden="true" />
                        {labels.triggerMetadataPreview}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={previewTab === 'resources'}
                        className={previewTab === 'resources' ? 'active' : ''}
                        onClick={() => setPreviewTab('resources')}
                    >
                        <span className="codicon codicon-server-environment" aria-hidden="true" />
                        {labels.resourceMetadataPreview}
                    </button>
                </div>
                <pre>{previewTab === 'trigger' ? triggerMetadata : resourceMetadata}</pre>
                {projectCreationError &&
                    <p className="project-creation-error" role="alert">{projectCreationError}</p>
                }
                {templateUnavailable &&
                    <p className="warning-text" role="status">{labels.selectionUnavailable}</p>
                }
                <div className="use-template-row">
                    {projectCreating && <span>{projectCreationDetail || labels.creatingProject}</span>}
                    <Button
                        appearance="primary"
                        disabled={projectCreating || catalogLoading || templateUnavailable}
                        onClick={onUseTemplate}
                    >
                        {projectCreating ?
                            labels.creatingProject :
                            templateUnavailable ?
                                labels.unavailable :
                            catalogLoading ?
                                labels.refreshingCatalog :
                                labels.useTemplate}
                    </Button>
                </div>
            </div>
        </section>
    );
}

function EventParameterGrid({
    idPrefix,
    inputs,
    inputValues,
    labels,
    setInputValue,
}: {
    idPrefix: string;
    inputs: readonly ConnectorTriggerInputDefinition[];
    inputValues: Record<string, string | boolean>;
    labels: ConnectorTriggerPickerViewModel['labels'];
    setInputValue: (name: string, value: string | boolean) => void;
}): JSX.Element {
    return (
        <div className="event-parameter-grid">
            {inputs.map((input, index) =>
                <EventParameterField
                    key={input.name}
                    id={`${idPrefix}-${index}`}
                    input={input}
                    labels={labels}
                    value={inputValues[input.name]}
                    onChange={value => setInputValue(input.name, value)}
                />
            )}
        </div>
    );
}

function EventParameterField({
    id,
    input,
    labels,
    value,
    onChange,
}: {
    id: string;
    input: ConnectorTriggerInputDefinition;
    labels: ConnectorTriggerPickerViewModel['labels'];
    value: string | boolean | undefined;
    onChange: (value: string | boolean) => void;
}): JSX.Element {
    const label = (
        <span>
            {input.label}
            {input.required && <small> ({labels.requiredParameter})</small>}
        </span>
    );
    let control: JSX.Element;
    if (input.type === 'boolean') {
        control = (
            <label className="boolean-parameter" htmlFor={id}>
                <input
                    id={id}
                    type="checkbox"
                    required={input.required}
                    checked={value === true}
                    onChange={event => onChange(event.target.checked)}
                />
                {label}
            </label>
        );
    } else if (input.options?.length) {
        control = (
            <>
                <label htmlFor={id}>{label}</label>
                <select
                    id={id}
                    required={input.required}
                    value={typeof value === 'string' ? value : ''}
                    onChange={event => onChange(event.target.value)}
                >
                    <option value="" />
                    {input.options.map(option =>
                        <option key={option.value} value={option.value}>{option.label}</option>
                    )}
                </select>
            </>
        );
    } else if (input.type === 'array' || input.type === 'object') {
        control = (
            <>
                <label htmlFor={id}>{label}</label>
                <textarea
                    id={id}
                    required={input.required}
                    value={typeof value === 'string' ? value : ''}
                    onChange={event => onChange(event.target.value)}
                />
            </>
        );
    } else {
        control = (
            <>
                <label htmlFor={id}>{label}</label>
                <input
                    id={id}
                    type={input.sensitive ?
                        'password' :
                        input.type === 'integer' || input.type === 'number' ?
                            'number' :
                            'text'}
                    required={input.required}
                    value={typeof value === 'string' ? value : ''}
                    onChange={event => onChange(event.target.value)}
                />
            </>
        );
    }

    return (
        <div className="event-parameter">
            {control}
            {input.description && <small>{input.description}</small>}
            {input.dynamic && <small>{labels.dynamicParameterDescription}</small>}
        </div>
    );
}

export function getDeliverySupport(
    operation: Pick<ConnectorTriggerOperationOption, 'isNotification' | 'isWebhook'>,
): { polling: boolean; webhook: boolean } {
    return {
        polling: !operation.isWebhook,
        webhook: false,
    };
}

export function partitionEventParameters(
    inputDefinitions: readonly ConnectorTriggerInputDefinition[],
): {
    primary: ConnectorTriggerInputDefinition[];
    optional: ConnectorTriggerInputDefinition[];
} {
    const primary: ConnectorTriggerInputDefinition[] = [];
    const optional: ConnectorTriggerInputDefinition[] = [];
    for (const input of inputDefinitions) {
        if (input.required ||
            input.dynamic ||
            input.visibility?.toLowerCase() === 'important') {
            primary.push(input);
        } else {
            optional.push(input);
        }
    }

    return { primary, optional };
}

function format(template: string, value: string): string {
    return template.replace('{0}', value);
}
