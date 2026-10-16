/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type CollectionReviewConfiguration, type HttpInvocationCandidate } from '../shared/collectionReview';
import { getRequestDependencies, httpMethods, type HttpRequest, type HttpRequestEntry, type HttpRequestStateMessage, type InvocationSource } from '../shared/httpRequest';
import { ResponseBindingsEditor } from './ResponseBindingsEditor';

type Labels = CollectionReviewConfiguration['labels'];

function field(label: string, control: HTMLElement): HTMLLabelElement {
    const element = document.createElement('label');
    element.className = 'request-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    element.append(caption, control);
    return element;
}

function entriesEditor(title: string, labels: Labels) {
    const element = document.createElement('section');
    element.className = 'preview-entries';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const list = document.createElement('div');
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary';
    add.textContent = labels.add;
    const rows: { element: HTMLElement; name: HTMLInputElement; value: HTMLInputElement; enabled: HTMLInputElement; explicit: boolean }[] = [];

    function append(entry: HttpRequestEntry = { name: '', value: '', enabled: false }): void {
        const row = document.createElement('div');
        row.className = 'preview-entry';
        const name = document.createElement('input');
        name.value = entry.name;
        name.placeholder = labels.name;
        name.setAttribute('aria-label', labels.name);
        const value = document.createElement('input');
        value.value = entry.value;
        value.placeholder = labels.value;
        value.setAttribute('aria-label', labels.value);
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = entry.enabled !== false;
        enabled.setAttribute('aria-label', labels.enabled);
        value.addEventListener('input', () => {
            if (value.value) {
                enabled.checked = true;
            }
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary remove-entry';
        remove.textContent = '\u00d7';
        remove.setAttribute('aria-label', labels.remove);
        const item = { element: row, name, value, enabled, explicit: entry.enabled !== undefined };
        remove.addEventListener('click', () => {
            rows.splice(rows.indexOf(item), 1);
            row.remove();
            add.disabled = rows.length >= 100;
            add.focus();
        });
        row.append(name, value, enabled, remove);
        list.append(row);
        rows.push(item);
        add.disabled = rows.length >= 100;
    }

    add.addEventListener('click', () => {
        append();
        rows[rows.length - 1].name.focus();
    });
    element.append(heading, list, add);
    return {
        element,
        read: (): HttpRequestEntry[] => rows.map(row => ({
            name: row.name.value,
            value: row.value.value,
            ...(row.explicit || !row.enabled.checked ? { enabled: row.enabled.checked } : {}),
        })),
        set: (entries: HttpRequestEntry[]) => {
            rows.length = 0;
            list.replaceChildren();
            add.disabled = false;
            entries.forEach(append);
        },
    };
}

export class HttpRequestPreview {
    public readonly element = document.createElement('form');
    private readonly fields = document.createElement('fieldset');
    private readonly method = document.createElement('select');
    private readonly url = document.createElement('input');
    private readonly body = document.createElement('textarea');
    private readonly bodyField: HTMLLabelElement;
    private readonly headers;
    private readonly query;
    private readonly send = document.createElement('button');
    private readonly cancel = document.createElement('button');
    private readonly runChain = document.createElement('button');
    private readonly dependencies: ResponseBindingsEditor;
    private readonly status = document.createElement('output');
    private readonly responseBody = document.createElement('pre');
    private readonly responseHeaders = document.createElement('details');
    private readonly headerValues = document.createElement('pre');
    private readonly error = document.createElement('p');
    private enabled = true;
    private busy = false;
    private sequence = 0;

    public constructor(
        candidate: HttpInvocationCandidate,
        private readonly labels: Labels,
        send: (request: HttpRequest, runDependencies: boolean) => void,
        cancel: () => void,
        private readonly onBusyChange: () => void,
        sources: InvocationSource[],
    ) {
        this.element.className = 'request-preview';
        this.headers = entriesEditor(labels.headers, labels);
        this.query = entriesEditor(labels.query, labels);
        this.dependencies = new ResponseBindingsEditor(candidate.request, sources, labels.dependencies, () => this.updateControls());
        const dependencies = document.createElement('details');
        const dependencyHeading = document.createElement('summary');
        dependencyHeading.textContent = labels.dependencies.title;
        dependencies.append(dependencyHeading, this.dependencies.element);
        dependencies.open = !!getRequestDependencies(candidate.request).length;
        for (const method of httpMethods) {
            this.method.add(new Option(method, method));
        }
        this.url.type = 'url';
        this.url.required = true;
        this.url.spellcheck = false;
        const auth = document.createElement('span');
        auth.textContent = labels[candidate.auth];
        this.body.rows = 6;
        this.body.spellcheck = false;
        this.bodyField = field(labels.body, this.body);
        this.fields.append(
            field(labels.method, this.method),
            field(labels.endpoint, this.url),
            field(labels.authentication, auth),
            this.query.element,
            this.headers.element,
            dependencies,
            this.bodyField,
        );
        this.method.addEventListener('change', () => this.updateBody());
        this.send.type = 'submit';
        this.send.className = 'send-preview';
        this.runChain.type = 'button';
        this.runChain.className = 'secondary run-preview-chain';
        this.runChain.textContent = labels.dependencies.runChain;
        this.cancel.type = 'button';
        this.cancel.className = 'secondary cancel-preview';
        this.cancel.textContent = labels.cancel;
        this.cancel.addEventListener('click', cancel);
        const actions = document.createElement('div');
        actions.className = 'preview-actions';
        actions.append(this.send, this.runChain, this.cancel);
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = labels.previewHint;
        const response = document.createElement('section');
        response.className = 'preview-response';
        const heading = document.createElement('h3');
        heading.textContent = labels.response;
        this.status.setAttribute('role', 'status');
        this.error.className = 'preview-error';
        this.error.setAttribute('role', 'alert');
        this.error.hidden = true;
        this.responseBody.className = 'preview-response-body';
        this.responseBody.tabIndex = 0;
        this.responseBody.hidden = true;
        const summary = document.createElement('summary');
        summary.textContent = labels.headers;
        this.responseHeaders.append(summary, this.headerValues);
        this.responseHeaders.hidden = true;
        response.append(heading, this.status, this.error, this.responseBody, this.responseHeaders);
        this.element.append(this.fields, actions, hint, response);
        const submit = (runDependencies: boolean): void => {
            if (this.enabled && !this.busy) {
                this.update({ command: 'requestStarted', saved: false });
                send(this.request, runDependencies);
            }
        };
        this.element.addEventListener('submit', event => {
            event.preventDefault();
            submit(false);
        });
        this.runChain.addEventListener('click', () => {
            if (this.element.reportValidity()) {
                submit(true);
            }
        });
        this.setRequest(candidate.request);
        this.updateControls();
    }

    public get running(): boolean {
        return this.busy;
    }

    public get request(): HttpRequest {
        return { method: httpMethods[this.method.selectedIndex], url: this.url.value, body: this.body.value, headers: this.headers.read(), query: this.query.read(), ...this.dependencies.read() };
    }

    public setRequest(request: HttpRequest): void {
        this.method.value = request.method;
        this.url.value = request.url;
        this.body.value = request.body;
        this.headers.set(request.headers);
        this.query.set(request.query);
        this.dependencies.set(request);
        this.updateBody();
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.updateControls();
    }

    public update(message: HttpRequestStateMessage): void {
        if (message.sequence !== undefined) {
            if (message.sequence <= this.sequence) {
                return;
            }
            this.sequence = message.sequence;
        }
        this.busy = message.command === 'requestStarted';
        this.error.hidden = true;
        if (message.command === 'requestStarted') {
            this.status.textContent = this.labels.sending;
            this.responseBody.hidden = true;
            this.responseHeaders.hidden = true;
        } else if (message.command === 'response') {
            this.status.textContent = `${message.response.status}, ${message.response.duration} ms`;
            this.responseBody.textContent = message.response.body;
            this.responseBody.hidden = false;
            this.headerValues.textContent = message.response.headers.map(header => `${header.name}: ${header.value}`).join('\n');
            this.responseHeaders.hidden = !message.response.headers.length;
        } else {
            this.status.textContent = '';
            this.error.textContent = message.message;
            this.error.hidden = false;
        }
        this.updateControls();
        this.onBusyChange();
    }

    private updateBody(): void {
        this.bodyField.hidden = this.method.value === 'GET' || this.method.value === 'HEAD';
    }

    private updateControls(): void {
        this.fields.disabled = !this.enabled || this.busy;
        this.send.disabled = !this.enabled || this.busy;
        this.runChain.disabled = !this.enabled || this.busy;
        this.runChain.hidden = !getRequestDependencies(this.dependencies.read()).length;
        this.send.textContent = this.busy ? this.labels.sending : this.labels.send;
        this.cancel.hidden = !this.busy;
        this.responseBody.setAttribute('aria-busy', String(this.busy));
    }
}
