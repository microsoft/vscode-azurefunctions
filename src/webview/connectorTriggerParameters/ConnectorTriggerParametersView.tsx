/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { type JSX } from 'react';
import {
    type ConnectorParameterAction,
    type ConnectorParameterField,
    type ConnectorParameterFormState,
    type ConnectorTriggerParametersViewModel,
} from './ConnectorTriggerParametersViewModel';

export function ConnectorTriggerParameterSection({
    viewModel,
    state,
    send,
    disabled,
}: {
    viewModel: ConnectorTriggerParametersViewModel;
    state?: ConnectorParameterFormState;
    send: (action: ConnectorParameterAction) => void;
    disabled: boolean;
}): JSX.Element {
    const { labels } = viewModel;
    const renderField = (field: ConnectorParameterField, index: number) => (
        <ParameterField key={field.name} field={field} id={`parameter-${index}`} labels={labels} send={send} />
    );
    return (
        <section>
            <h2>{labels.parameters} <span className="parameter-connected">{labels.connected}</span></h2>
            <p>{viewModel.connector}</p>
            <p className="step-description">{viewModel.event}</p>
            <form onSubmit={event => {
                event.preventDefault();
                send({ command: 'submit' });
            }}>
                <fieldset className="parameter-fields" disabled={disabled}>
                    {!state && <p role="status">{labels.loading}</p>}
                    {state?.fields.filter(field => !field.advanced).map(renderField)}
                    {!!state?.fields.some(field => field.advanced) && (
                        <details className="parameter-advanced">
                            <summary>{labels.advanced}</summary>
                            {state.fields.filter(field => field.advanced).map((field, index) => renderField(field, index + state.fields.length))}
                        </details>
                    )}
                    {state?.error && <p className="parameter-error" role="alert">{state.error}</p>}
                    <p className="parameter-notice">{labels.runtimeNotice}</p>
                    <div className="parameter-actions">
                        <button className="parameter-primary" type="submit" disabled={!state?.canSubmit}>{labels.apply}</button>
                    </div>
                </fieldset>
            </form>
        </section>
    );
}

function ParameterField({
    field,
    id,
    labels,
    send,
}: {
    field: ConnectorParameterField;
    id: string;
    labels: ConnectorTriggerParametersViewModel['labels'];
    send: (action: ConnectorParameterAction) => void;
}): JSX.Element {
    const disabled = field.status !== 'ready';
    const describedBy = `${id}-description ${id}-status`;
    const select = (optionIds: string[]) => send({ command: 'select', name: field.name, optionIds });
    return (
        <div className="parameter-field" aria-busy={field.status === 'loading'}>
            <label id={`${id}-label`} htmlFor={field.kind === 'tree' ? undefined : id}>
                {field.label} <span className="parameter-requirement">{field.required ? labels.required : labels.optional}</span>
            </label>
            <p id={`${id}-description`} className="parameter-description">{field.description}</p>
            {field.kind === 'text' ? field.multiline ? (
                <textarea id={id} rows={4} value={field.text} aria-describedby={describedBy} aria-invalid={!!field.error}
                    onChange={event => send({ command: 'edit', name: field.name, text: event.target.value })} />
            ) : (
                <input id={id} type={field.sensitive ? 'password' : 'text'} value={field.text}
                    autoComplete="off" aria-describedby={describedBy} aria-invalid={!!field.error}
                    onChange={event => send({ command: 'edit', name: field.name, text: event.target.value })} />
            ) : field.kind === 'choices' ? (
                <select id={id} multiple={field.multiple} disabled={disabled} value={field.multiple ? field.selected : field.selected[0] ?? ''}
                    aria-describedby={describedBy} aria-invalid={!!field.error}
                    onChange={event => select(Array.from(event.target.selectedOptions).map(option => option.value).filter(Boolean))}>
                    {!field.multiple && <option value="">{labels.selectValue}</option>}
                    {field.options.filter(option => option.selectable).map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                </select>
            ) : (
                <div className="parameter-tree" role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
                    {field.canGoBack && <div className="parameter-tree-toolbar">
                        <button type="button" onClick={() => send({ command: 'back', name: field.name })}>
                            <span className="codicon codicon-arrow-left" aria-hidden="true" />{labels.back}
                        </button>
                        <strong>{field.parent?.label}</strong>
                        {field.parent?.selectable && <button type="button" disabled={disabled} onClick={() => select([field.parent?.id ?? ''])}>
                            {labels.selectFolder}
                        </button>}
                    </div>}
                    <ul aria-label={field.label}>
                        {field.options.map(option => (
                            <li key={option.id}>
                                <span className="codicon codicon-folder" aria-hidden="true" />
                                <button type="button" disabled={disabled || !option.selectable}
                                    aria-pressed={field.selected.includes(option.id)} onClick={() => select(field.multiple ?
                                        field.selected.includes(option.id) ? field.selected.filter(id => id !== option.id) : [...field.selected, option.id] :
                                        [option.id])}>
                                    {option.label}
                                </button>
                                {option.hasChildren && <button type="button" disabled={disabled}
                                    aria-label={`${labels.browse}: ${option.label}`}
                                    onClick={() => send({ command: 'browse', name: field.name, optionId: option.id })}>
                                    <span className="codicon codicon-chevron-right" aria-hidden="true" />
                                </button>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div id={`${id}-status`} className="parameter-status" aria-live="polite">
                {field.status === 'loading' && <p role="status">{labels.loading}</p>}
                {!!field.dependencyLabels.length && <p>{labels.dependencies} {field.dependencyLabels.join(', ')}</p>}
                {field.status === 'ready' && field.kind !== 'text' && !field.options.length && <p>{labels.empty}</p>}
                {!!field.selectedLabels.length && <p>{labels.selected} <strong>{field.selectedLabels.join(', ')}</strong></p>}
                {field.error && <p className="parameter-error" role="alert">{field.error}</p>}
            </div>
            {field.kind !== 'text' && <div className="parameter-field-actions">
                {!field.required && !!field.selected.length && <button type="button" disabled={disabled} onClick={() => select([])}>{labels.clear}</button>}
                {field.dynamic ?
                    <button type="button" disabled={field.status === 'loading' || !!field.dependencyLabels.length}
                        onClick={() => send({ command: 'reload', name: field.name })}>{labels.retry}</button> : null}
            </div>}
        </div>
    );
}
