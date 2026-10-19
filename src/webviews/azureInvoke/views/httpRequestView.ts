/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getRequestDependencies, httpMethods, type HttpRequest, type HttpRequestEntry, type HttpRequestMessage, type HttpRequestViewConfiguration, type HttpRequestViewLabels, type HttpResponseMessage } from '../shared/httpRequest';
import { ResponseBindingsEditor } from './ResponseBindingsEditor';
import { formatResponseBody } from './formatResponseBody';
import './httpRequestView.css';

declare global {
    interface Window {
        config: { _initialData: string };
    }
}

function getElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
        throw new Error(`Missing HTTP request view element: ${selector}`);
    }
    return element;
}

export function render(_viewName: string, api: { postMessage(message: HttpRequestMessage): void }): void {
    const configuration: HttpRequestViewConfiguration = JSON.parse(decodeURIComponent(window.config._initialData));
    const labels = configuration.labels;
    let invocationName = configuration.name;
    getElement('#root').innerHTML = `
        <main>
            <header>
                <div class="title-group">
                    <h1 id="invocation-name"></h1>
                    <button id="rename" type="button" class="secondary icon-button">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 2 4 4-8 8H2v-4ZM8 4l4 4"/></svg>
                    </button>
                    <span class="subtitle" data-label="subtitle"></span>
                </div>
                <div class="save-actions">
                    <span id="save-status" role="status"></span>
                    <button id="save" type="button" class="secondary" data-label="save"></button>
                </div>
            </header>
            <p id="save-error" role="alert" hidden></p>
            <form id="request-form">
                <div class="request-bar">
                    <label class="method-field"><span class="sr-only" data-label="method"></span><select id="method"></select></label>
                    <label class="url-field"><span class="sr-only" data-label="url"></span><input id="url" type="url" placeholder="http://localhost:7071/api/HttpTrigger" required spellcheck="false"></label>
                    <button id="send" type="submit" data-label="send"></button>
                    <button id="run-chain" type="button" class="secondary" hidden></button>
                    <button id="abort" type="button" class="secondary" data-label="cancel" hidden></button>
                </div>
                <p class="hint" data-label="functionKeyHint"></p>
                <div class="tabs" role="tablist" aria-label="">
                    <button id="params-tab" type="button" role="tab" aria-controls="params-panel" aria-selected="true" data-label="params"></button>
                    <button id="headers-tab" type="button" role="tab" aria-controls="headers-panel" aria-selected="false" tabindex="-1" data-label="headers"></button>
                    <button id="body-tab" type="button" role="tab" aria-controls="body-panel" aria-selected="false" tabindex="-1" data-label="body"></button>
                    <button id="dependencies-tab" type="button" role="tab" aria-controls="dependencies-panel" aria-selected="false" tabindex="-1"></button>
                </div>
                <section id="params-panel" role="tabpanel" aria-labelledby="params-tab">
                    <div id="query-rows"></div><button id="add-query" type="button" class="secondary" data-label="add"></button>
                </section>
                <section id="headers-panel" role="tabpanel" aria-labelledby="headers-tab" hidden>
                    <div id="header-rows"></div><button id="add-header" type="button" class="secondary" data-label="add"></button>
                </section>
                <section id="body-panel" role="tabpanel" aria-labelledby="body-tab" hidden>
                    <label for="body" class="sr-only" data-label="requestBody"></label>
                    <textarea id="body" rows="9" spellcheck="false"></textarea>
                    <p id="body-hint" class="hint" data-label="getBodyHint"></p>
                </section>
                <section id="dependencies-panel" role="tabpanel" aria-labelledby="dependencies-tab" hidden></section>
            </form>
            <section class="response-section" aria-labelledby="response-heading">
                <div class="response-heading"><h2 id="response-heading" data-label="response"></h2><output id="status" role="status"></output></div>
                <p id="saved-invocation-hint" class="hint" data-label="savedInvocationHint" hidden></p>
                <p id="response-placeholder" class="hint" data-label="responsePlaceholder"></p>
                <p id="error" role="alert" hidden></p>
                <pre id="response-body" tabindex="0" hidden></pre>
                <details id="response-headers" hidden><summary data-label="headers"></summary><pre></pre></details>
                <div class="response-actions">
                    <label id="breakpoint-guidance-field" class="breakpoint-guidance" hidden>
                        <span data-label="guidance"></span>
                        <textarea id="breakpoint-guidance" rows="3" maxlength="500" spellcheck="false"></textarea>
                    </label>
                    <button id="debug-response" type="button" class="secondary" data-label="debug" hidden></button>
                    <p id="debug-hint" class="hint" data-label="debugHint" hidden></p>
                    <p id="debug-notice" role="status" hidden></p>
                    <p id="debug-error" role="alert" hidden></p>
                </div>
            </section>
        </main>`;

    for (const element of document.querySelectorAll<HTMLElement>('[data-label]')) {
        const text = labels[element.dataset.label as keyof HttpRequestViewLabels];
        if (typeof text !== 'string') {
            throw new Error('Missing HTTP request label.');
        }
        element.textContent = text;
    }
    getElement('.tabs').setAttribute('aria-label', labels.requestOptions);
    const heading = getElement('#invocation-name');
    heading.textContent = invocationName;
    heading.title = invocationName;
    const rename = getElement<HTMLButtonElement>('#rename');
    rename.title = labels.rename;
    rename.setAttribute('aria-label', labels.rename);
    rename.addEventListener('click', () => api.postMessage({ command: 'renameRequest' }));

    const save = getElement<HTMLButtonElement>('#save');
    const saveStatus = getElement('#save-status');
    const saveError = getElement('#save-error');
    let revision = 0;
    let savedRevision = configuration.saved ? 0 : -1;
    let savingRevision: number | undefined;
    function updateSaveState(): void {
        const saved = revision === savedRevision;
        save.disabled = saved || savingRevision !== undefined;
        save.textContent = savingRevision === undefined ? labels.save : labels.saving;
        const text = saved ? labels.saved : labels.unsaved;
        if (saveStatus.textContent !== text) {
            saveStatus.textContent = text;
        }
    }
    function markDirty(): void {
        revision++;
        updateSaveState();
    }
    updateSaveState();
    const runChain = getElement<HTMLButtonElement>('#run-chain');
    runChain.textContent = labels.dependencies.runChain;
    getElement('#dependencies-tab').textContent = labels.dependencies.title;
    const dependencies = new ResponseBindingsEditor(configuration.request, configuration.sources ?? [], labels.dependencies, () => {
        markDirty();
        updateChain();
    });
    getElement('#dependencies-panel').append(dependencies.element);
    function updateChain(): void {
        runChain.hidden = !getRequestDependencies(dependencies.read()).length;
    }
    updateChain();

    const method = getElement<HTMLSelectElement>('#method');
    for (const value of httpMethods) {
        method.add(new Option(value, value));
    }
    method.value = configuration.request.method;
    getElement<HTMLInputElement>('#url').value = configuration.request.url;

    function addRow(container: HTMLElement, entry?: HttpRequestEntry): void {
        const row = document.createElement('div');
        row.className = 'entry-row';
        const name = document.createElement('input');
        name.placeholder = labels.name;
        name.setAttribute('aria-label', labels.name);
        name.spellcheck = false;
        name.value = entry?.name ?? '';
        const value = document.createElement('input');
        value.placeholder = labels.value;
        value.setAttribute('aria-label', labels.value);
        value.spellcheck = false;
        value.value = entry?.value ?? '';
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = entry?.enabled !== false;
        enabled.setAttribute('aria-label', labels.enabled);
        row.dataset.explicitEnabled = String(entry?.enabled !== undefined);
        value.addEventListener('input', () => {
            if (value.value) {
                enabled.checked = true;
            }
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary';
        remove.textContent = '\u00d7';
        remove.title = labels.remove;
        remove.setAttribute('aria-label', labels.remove);
        remove.addEventListener('click', () => {
            row.remove();
            markDirty();
            getElement<HTMLButtonElement>(container.id === 'query-rows' ? '#add-query' : '#add-header').focus();
        });
        row.append(name, value, enabled, remove);
        container.append(row);
    }

    const queryRows = getElement('#query-rows');
    const headerRows = getElement('#header-rows');
    for (const [container, selector, entries] of [
        [queryRows, '#add-query', configuration.request.query],
        [headerRows, '#add-header', configuration.request.headers],
    ] as const) {
        if (entries.length) {
            entries.forEach(entry => addRow(container, entry));
        } else {
            addRow(container);
        }
        getElement(selector).addEventListener('click', () => {
            addRow(container);
            markDirty();
            container.lastElementChild?.querySelector('input')?.focus();
        });
    }

    function readEntries(container: HTMLElement): HttpRequestEntry[] {
        return Array.from(container.children, row => {
            const [name, value, enabled] = row.querySelectorAll('input');
            return {
                name: name.value,
                value: value.value,
                ...((row instanceof HTMLElement && row.dataset.explicitEnabled === 'true') || !enabled.checked ? { enabled: enabled.checked } : {}),
            };
        });
    }

    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    function selectTab(tab: HTMLButtonElement): void {
        for (const item of tabs) {
            const selected = item === tab;
            item.setAttribute('aria-selected', String(selected));
            item.tabIndex = selected ? 0 : -1;
            getElement(`#${item.getAttribute('aria-controls')}`).hidden = !selected;
        }
    }
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => selectTab(tab));
        tab.addEventListener('keydown', event => {
            let target: HTMLButtonElement | undefined;
            if (event.key === 'ArrowRight') {
                target = tabs[(index + 1) % tabs.length];
            } else if (event.key === 'ArrowLeft') {
                target = tabs[(index + tabs.length - 1) % tabs.length];
            } else if (event.key === 'Home') {
                target = tabs[0];
            } else if (event.key === 'End') {
                target = tabs[tabs.length - 1];
            }
            if (target) {
                event.preventDefault();
                selectTab(target);
                target.focus();
            }
        });
    });

    const body = getElement<HTMLTextAreaElement>('#body');
    body.value = configuration.request.body;
    function updateBodyState(): void {
        body.disabled = method.value === 'GET' || method.value === 'HEAD';
        getElement('#body-hint').hidden = !body.disabled;
    }
    method.addEventListener('change', updateBodyState);
    updateBodyState();

    function readRequest(): HttpRequest {
        return {
            method: httpMethods[method.selectedIndex],
            url: getElement<HTMLInputElement>('#url').value,
            query: readEntries(queryRows),
            headers: readEntries(headerRows),
            body: body.value,
            ...dependencies.read(),
        };
    }
    getElement('#request-form').addEventListener('input', markDirty);
    save.addEventListener('click', () => {
        if (save.disabled) {
            return;
        }
        savingRevision = revision;
        saveError.hidden = true;
        updateSaveState();
        api.postMessage({ command: 'saveRequest', request: readRequest() });
    });
    window.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            save.click();
        }
    });

    const send = getElement<HTMLButtonElement>('#send');
    const abort = getElement<HTMLButtonElement>('#abort');
    const status = getElement<HTMLOutputElement>('#status');
    const error = getElement('#error');
    const responseBody = getElement('#response-body');
    const responseHeaders = getElement('#response-headers');
    const debug = getElement<HTMLButtonElement>('#debug-response');
    const guidance = getElement<HTMLTextAreaElement>('#breakpoint-guidance');
    guidance.placeholder = labels.guidancePlaceholder;
    guidance.title = labels.guidancePrivacy;
    const debugHint = getElement('#debug-hint');
    const debugNotice = getElement('#debug-notice');
    const debugError = getElement('#debug-error');
    let sending = false;
    let debugging = false;
    let hasResult = false;
    let sequence = 0;
    function updateDebugControls(): void {
        debug.hidden = !configuration.debugAvailable || savedRevision < 0 || !hasResult || sending;
        debugHint.hidden = debug.hidden;
        getElement('#breakpoint-guidance-field').hidden = debug.hidden;
        debug.disabled = sending || debugging || guidance.value.length > guidance.maxLength;
        guidance.disabled = sending || debugging;
    }
    guidance.addEventListener('input', updateDebugControls);
    debug.title = labels.debugHint;
    debug.addEventListener('click', () => {
        debugging = true;
        debugNotice.hidden = true;
        debugError.hidden = true;
        updateDebugControls();
        api.postMessage({ command: 'debugRequest', breakpointGuidance: guidance.value });
    });
    function setSending(value: boolean): void {
        sending = value;
        send.disabled = value;
        runChain.disabled = value;
        send.textContent = value ? labels.sending : labels.send;
        abort.hidden = !value;
        getElement('#response-body').setAttribute('aria-busy', String(value));
        updateDebugControls();
    }

    function startRequest(saved: boolean): void {
        hasResult = false;
        debugNotice.hidden = true;
        debugError.hidden = true;
        error.hidden = true;
        responseBody.hidden = true;
        responseHeaders.hidden = true;
        getElement('#response-placeholder').hidden = true;
        getElement('#saved-invocation-hint').hidden = !saved;
        status.textContent = labels.sending;
        status.classList.remove('http-error');
        setSending(true);
    }
    function sendRequest(runDependencies = false): void {
        if (sending) {
            return;
        }
        startRequest(false);
        api.postMessage({
            command: 'sendRequest',
            runDependencies,
            request: {
                ...readRequest(),
                body: body.disabled ? '' : body.value,
            },
        });
    }
    getElement<HTMLFormElement>('#request-form').addEventListener('submit', event => {
        event.preventDefault();
        sendRequest();
    });
    runChain.addEventListener('click', () => {
        if (getElement<HTMLFormElement>('#request-form').reportValidity()) {
            sendRequest(true);
        }
    });
    abort.addEventListener('click', () => api.postMessage({ command: 'abortRequest' }));
    window.addEventListener('message', (event: MessageEvent<HttpResponseMessage>) => {
        const message = event.data;
        if ('sequence' in message && message.sequence !== undefined) {
            if (message.sequence <= sequence) {
                return;
            }
            sequence = message.sequence;
        }
        if (message.command === 'requestStarted') {
            startRequest(message.saved);
        } else if (message.command === 'response') {
            setSending(false);
            status.textContent = `${message.response.status} \u00b7 ${message.response.duration} ms`;
            status.classList.toggle('http-error', message.response.status >= 400);
            responseBody.textContent = formatResponseBody(message.response.body);
            responseBody.hidden = false;
            getElement('#response-headers pre').textContent = message.response.headers.map(entry => `${entry.name}: ${entry.value}`).join('\n');
            responseHeaders.hidden = false;
            hasResult = true;
            updateDebugControls();
        } else if (message.command === 'requestError') {
            setSending(false);
            status.textContent = '';
            error.textContent = message.message;
            error.classList.toggle('request-warning', !!message.blocked);
            error.hidden = false;
            hasResult = !message.cancelled && !message.blocked;
            updateDebugControls();
        } else if (message.command === 'debugState') {
            debugging = message.busy;
            debugNotice.textContent = message.message ?? '';
            debugNotice.hidden = !message.message;
            debugError.textContent = message.error ?? '';
            debugError.hidden = !message.error;
            updateDebugControls();
        } else if (message.command === 'renamed') {
            if (invocationName !== message.name) {
                invocationName = message.name;
                heading.textContent = invocationName;
                heading.title = invocationName;
                markDirty();
            }
        } else if (message.command === 'requestSaved') {
            if (savingRevision !== undefined) {
                savedRevision = savingRevision;
                savingRevision = undefined;
                updateSaveState();
                updateDebugControls();
            }
        } else if (message.command === 'saveError') {
            savingRevision = undefined;
            saveError.textContent = message.message;
            saveError.hidden = false;
            updateSaveState();
        } else if (message.command === 'sources') {
            dependencies.setSources(message.sources);
        }
    });
    api.postMessage({ command: 'ready' });
}
