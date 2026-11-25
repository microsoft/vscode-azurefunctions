/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getRequestDependencies, httpMethods, type HttpRequest } from '../../../azureInvoke/models/httpSchema';
import { type HttpRequestMessage, type HttpRequestViewConfiguration, type HttpRequestViewLabels, type HttpResponseMessage } from '../shared/invocationEditorProtocol';
import { EntryTable } from './EntryTable';
import { ResponseBindingsEditor } from './ResponseBindingsEditor';
import { formatResponseBody } from './formatResponseBody';
import './httpRequestView.css';

declare global {
    interface Window {
        /** Set by the webview host page. `_initialData` is the URI-encoded JSON `HttpRequestViewConfiguration`. */
        config: { _initialData: string };
    }
}

/**
 * Returns the element matching `selector`, and throws if it's missing so a broken template fails loudly.
 */
function getElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
        throw new Error(`Missing HTTP request view element: ${selector}`);
    }
    return element;
}

/**
 * Builds the HTTP request editor inside `#root` and wires it to the extension.
 *
 * The view talks to the extension only through messages:
 * - It sends `HttpRequestMessage`s through `api.postMessage`: ready, save, send, cancel, and rename.
 * - It receives `HttpResponseMessage`s on `window`: run progress, save results, renames, and dependency sources.
 *
 * The view never holds the saved invocation. It reads the form into a new request whenever it saves or sends.
 */
export function render(_viewName: string, api: { postMessage(message: HttpRequestMessage): void }): void {
    const configuration: HttpRequestViewConfiguration = JSON.parse(decodeURIComponent(window.config._initialData));
    const labels = configuration.labels;
    let invocationName = configuration.name;

    // ---- Layout ----
    // Static markup only. Text is filled in below from `labels`, and user values are set through properties,
    // so nothing from the request is ever parsed as HTML.
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
            </section>
        </main>`;

    // ---- Labels and title ----
    // Every element with `data-label="key"` gets `labels[key]` as its text. A missing key is a bug, so fail loudly.
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
    // The extension shows the rename prompt and replies with a `renamed` message.
    rename.addEventListener('click', () => api.postMessage({ command: 'renameRequest' }));

    // ---- Save state ----
    // Each edit bumps `revision`. The form counts as saved when the latest saved revision equals the current one.
    // A save in flight remembers the revision it sent, so an edit made while saving stays unsaved afterward.
    const save = getElement<HTMLButtonElement>('#save');
    const saveStatus = getElement('#save-status');
    const saveError = getElement('#save-error');
    /** Increases with every edit to the form. */
    let revision = 0;
    /** Revision that was last saved. A new draft starts at -1, so it shows as unsaved. */
    let savedRevision = configuration.saved ? 0 : -1;
    /** Revision being saved right now, or undefined when no save is in flight. */
    let savingRevision: number | undefined;

    /**
     * Updates the Save button and the saved or unsaved status text to match the revisions.
     */
    function updateSaveState(): void {
        const saved = revision === savedRevision;
        save.disabled = saved || savingRevision !== undefined;
        save.textContent = savingRevision === undefined ? labels.save : labels.saving;
        const text = saved ? labels.saved : labels.unsaved;
        // Only write on change, because the status element is a live region and screen readers announce every write.
        if (saveStatus.textContent !== text) {
            saveStatus.textContent = text;
        }
    }

    /**
     * Records an edit. Called for typing anywhere in the form and for changes that fire no input event.
     */
    function markDirty(): void {
        revision++;
        updateSaveState();
    }
    updateSaveState();

    // ---- Dependencies ----
    // The Dependencies tab edits which saved invocations this request waits on or reads values from.
    // Run chain is shown only when there is at least one prerequisite to run.
    const runChain = getElement<HTMLButtonElement>('#run-chain');
    runChain.textContent = labels.dependencies.runChain;
    getElement('#dependencies-tab').textContent = labels.dependencies.title;
    const dependencies = new ResponseBindingsEditor(configuration.request, configuration.sources ?? [], labels.dependencies, () => {
        markDirty();
        updateChain();
    });
    getElement('#dependencies-panel').append(dependencies.element);

    /**
     * Shows Run chain only while the request has prerequisites.
     */
    function updateChain(): void {
        runChain.hidden = !getRequestDependencies(dependencies.read()).length;
    }
    updateChain();

    // ---- Request fields ----
    const method = getElement<HTMLSelectElement>('#method');
    for (const value of httpMethods) {
        method.add(new Option(value, value));
    }
    method.value = configuration.request.method;
    getElement<HTMLInputElement>('#url').value = configuration.request.url;

    const query = new EntryTable(getElement('#query-rows'), getElement<HTMLButtonElement>('#add-query'), configuration.request.query, labels, markDirty);
    const headers = new EntryTable(getElement('#header-rows'), getElement<HTMLButtonElement>('#add-header'), configuration.request.headers, labels, markDirty);

    // ---- Tabs ----
    // Follows the WAI-ARIA tabs pattern: only the selected tab is in the Tab order, and the arrow, Home,
    // and End keys move between tabs.
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    /**
     * Selects `tab`, shows its panel, and hides the others.
     */
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

    // ---- Body ----
    const body = getElement<HTMLTextAreaElement>('#body');
    body.value = configuration.request.body;

    /**
     * Disables the body for GET and HEAD, which never send one, and shows a hint explaining why.
     */
    function updateBodyState(): void {
        // Keep the text when switching methods. Preflight rejects a nonempty GET or HEAD body.
        body.disabled = method.value === 'GET' || method.value === 'HEAD';
        getElement('#body-hint').hidden = !body.disabled;
    }
    method.addEventListener('change', updateBodyState);
    updateBodyState();

    // ---- Saving ----

    /**
     * Reads the form into a new request. Save and Send both use it, so they always see the same values,
     * including unchecked rows and body text kept while the body is disabled.
     */
    function readRequest(): HttpRequest {
        return {
            method: httpMethods[method.selectedIndex],
            url: getElement<HTMLInputElement>('#url').value,
            query: query.read(),
            headers: headers.read(),
            body: body.value,
            ...dependencies.read(),
        };
    }

    // Typing and checkbox toggles anywhere in the form bubble up as `input` events.
    getElement('#request-form').addEventListener('input', markDirty);

    // The extension replies with `requestSaved` or `saveError`, handled in the message listener below.
    save.addEventListener('click', () => {
        if (save.disabled) {
            return;
        }
        savingRevision = revision;
        saveError.hidden = true;
        updateSaveState();
        api.postMessage({ command: 'saveRequest', request: readRequest() });
    });
    // Ctrl+S or Cmd+S saves, like a text editor.
    window.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            save.click();
        }
    });

    // ---- Sending ----
    const send = getElement<HTMLButtonElement>('#send');
    const abort = getElement<HTMLButtonElement>('#abort');
    const status = getElement<HTMLOutputElement>('#status');
    const error = getElement('#error');
    const responseBody = getElement('#response-body');
    const responseHeaders = getElement('#response-headers');
    /** Whether a run is in progress. Blocks a second Send until it finishes. */
    let sending = false;
    /** Sequence number of the latest run message applied. See the message listener below. */
    let sequence = 0;

    /**
     * Switches the buttons between idle and running: disables Send and Run chain, and shows Cancel while running.
     */
    function setSending(value: boolean): void {
        sending = value;
        send.disabled = value;
        runChain.disabled = value;
        send.textContent = value ? labels.sending : labels.send;
        abort.hidden = !value;
        getElement('#response-body').setAttribute('aria-busy', String(value));
    }

    /**
     * Clears the previous response and shows the running state.
     * `saved` shows a hint that the run used the saved invocation rather than what's in the form.
     */
    function startRequest(saved: boolean): void {
        error.hidden = true;
        responseBody.hidden = true;
        responseHeaders.hidden = true;
        getElement('#response-placeholder').hidden = true;
        getElement('#saved-invocation-hint').hidden = !saved;
        status.textContent = labels.sending;
        status.classList.remove('http-error');
        setSending(true);
    }
    /**
     * Sends the form's current request to the extension. With `runDependencies`, its prerequisites run first.
     */
    function sendRequest(runDependencies = false): void {
        if (sending) {
            return;
        }

        // Show the running state right away. The extension's `requestStarted` message follows and repeats this.
        startRequest(false);
        api.postMessage({
            command: 'sendRequest',
            runDependencies,
            request: readRequest(),
        });
    }
    // Send is the form's submit button, so pressing Enter in the URL field also sends.
    getElement<HTMLFormElement>('#request-form').addEventListener('submit', event => {
        event.preventDefault();
        sendRequest();
    });
    // Run chain isn't a submit button, so check the form's required fields here.
    runChain.addEventListener('click', () => {
        if (getElement<HTMLFormElement>('#request-form').reportValidity()) {
            sendRequest(true);
        }
    });
    abort.addEventListener('click', () => api.postMessage({ command: 'abortRequest' }));
    // ---- Messages from the extension ----
    window.addEventListener('message', (event: MessageEvent<HttpResponseMessage>) => {
        const message = event.data;

        // Run messages carry an increasing sequence number. On `ready` the extension replays the latest run's
        // messages, so drop any that aren't newer than the last one applied.
        if ('sequence' in message && message.sequence !== undefined) {
            if (message.sequence <= sequence) {
                return;
            }
            sequence = message.sequence;
        }

        switch (message.command) {
            // A run started, from this view or from elsewhere, such as a tool.
            case 'requestStarted':
                startRequest(message.saved);
                break;

            case 'response':
                setSending(false);
                status.textContent = `${message.response.status} \u00b7 ${message.response.duration} ms`;
                status.classList.toggle('http-error', message.response.status >= 400);
                responseBody.textContent = formatResponseBody(message.response.body);
                responseBody.hidden = false;
                getElement('#response-headers pre').textContent = message.response.headers.map(entry => `${entry.name}: ${entry.value}`).join('\n');
                responseHeaders.hidden = false;
                break;

            // No response: the run failed, was cancelled, or was blocked. Blocked shows as a warning, not an error.
            case 'requestError':
                setSending(false);
                status.textContent = '';
                error.textContent = message.message;
                error.classList.toggle('request-warning', !!message.blocked);
                error.hidden = false;
                break;

            // A rename is an unsaved change until the next save.
            case 'renamed':
                if (invocationName !== message.name) {
                    invocationName = message.name;
                    heading.textContent = invocationName;
                    heading.title = invocationName;
                    markDirty();
                }
                break;

            case 'requestSaved':
                if (savingRevision !== undefined) {
                    // Acknowledge only the revision we sent. Edits made while saving are still unsaved.
                    savedRevision = savingRevision;
                    savingRevision = undefined;
                    updateSaveState();
                }
                break;

            case 'saveError':
                savingRevision = undefined;
                saveError.textContent = message.message;
                saveError.hidden = false;
                updateSaveState();
                break;

            // The saved invocations this request can depend on changed.
            case 'sources':
                dependencies.setSources(message.sources);
                break;
        }
    });

    // Tell the extension the view is listening, so it sends the dependency sources and replays any run in progress.
    api.postMessage({ command: 'ready' });
}
