/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type BlobInvocation, type BlobViewConfiguration, type BlobViewMessage } from '../shared/blobInvocation';
import './httpRequestView.css';
import './blobInvocation.css';

export function render(_viewName: string, api: { postMessage(message: unknown): void }): void {
    const configuration: BlobViewConfiguration = JSON.parse(decodeURIComponent(window.config._initialData));
    const labels = configuration.labels;
    const element = <T extends HTMLElement>(selector: string): T => {
        const value = document.querySelector<T>(selector);
        if (!value) {
            throw new Error(`Missing Blob editor element: ${selector}`);
        }
        return value;
    };
    element('#root').innerHTML = `
        <main>
            <header><div class="title-group"><h1></h1><span class="subtitle" data-label="subtitle"></span></div>
                <div class="save-actions"><span id="save-status" role="status"></span><button id="save" class="secondary" data-label="save"></button></div>
            </header>
            <form id="blob-form">
                <label><span data-label="name"></span><input id="name" required maxlength="100" spellcheck="false"></label>
                <label><span data-label="target"></span><input id="target" type="url" required spellcheck="false"></label>
                <div class="blob-fields">
                    <label><span data-label="container"></span><input id="container" required spellcheck="false" placeholder="samples"></label>
                    <label><span data-label="blobName"></span><input id="blob-name" required spellcheck="false" placeholder="sample.json"></label>
                    <label><span data-label="contentType"></span><input id="content-type" required spellcheck="false"></label>
                </div>
                <div class="blob-file-field" role="group" aria-labelledby="file-label">
                    <span id="file-label" data-label="fileLabel"></span>
                    <div class="blob-file-picker">
                    <button id="load-file" type="button" class="secondary" data-label="file"></button>
                    <span id="selected-file" role="status"></span>
                    </div>
                </div>
                <label class="breakpoint-guidance-field">
                    <span data-label="breakpointGuidance"></span>
                    <textarea id="breakpoint-guidance" rows="3" maxlength="500" spellcheck="false"></textarea>
                </label>
                <div class="blob-actions"><button id="upload" type="submit" data-label="upload"></button>
                    <button id="cancel" type="button" class="secondary" data-label="cancel" hidden></button>
                    <button id="debug" type="button" class="secondary" data-label="debug"></button>
                </div>
            </form>
            <p id="notice" role="status" hidden></p><p id="error" role="alert" hidden></p>
            <section class="response-section"><h2 data-label="receipt"></h2><p class="hint" data-label="receiptHint"></p>
                <p id="upload-status" role="status"></p><dl id="receipt" hidden></dl>
            </section>
        </main>`;
    for (const item of document.querySelectorAll<HTMLElement>('[data-label]')) {
        item.textContent = labels[item.dataset.label ?? ''];
    }
    const input = (selector: string): HTMLInputElement => element<HTMLInputElement>(selector);
    input('#name').value = configuration.invocation.name;
    element('h1').textContent = configuration.invocation.name;
    const request = configuration.invocation.request;
    input('#target').value = request.target.url;
    input('#container').value = request.container;
    input('#blob-name').value = request.blobName;
    input('#content-type').value = request.contentType;
    let content = request.content;
    let encoding = request.encoding;
    let fileName = request.fileName;
    let hasFile = configuration.saved || fileName !== undefined || content.length > 0;

    let revision = 0;
    let savedRevision = configuration.saved ? 0 : -1;
    let pendingSave: number | undefined;
    let busy = false;
    let openingDebug = false;
    let pickingFile = false;
    const save = element<HTMLButtonElement>('#save');
    const debug = element<HTMLButtonElement>('#debug');
    const guidance = element<HTMLTextAreaElement>('#breakpoint-guidance');
    guidance.placeholder = labels.breakpointGuidancePlaceholder;
    guidance.title = labels.breakpointGuidancePrivacy;
    function updateControls(): void {
        save.disabled = busy || pickingFile || !hasFile || pendingSave !== undefined || revision === savedRevision;
        save.textContent = pendingSave === undefined ? labels.save : labels.saving;
        debug.disabled = busy || pickingFile || !hasFile || openingDebug || pendingSave !== undefined || revision !== savedRevision || guidance.value.length > guidance.maxLength;
        guidance.disabled = busy || openingDebug;
        element('#save-status').textContent = revision === savedRevision ? labels.saved : labels.unsaved;
        element<HTMLButtonElement>('#upload').disabled = busy || pickingFile || !hasFile;
        element('#upload').textContent = busy ? labels.uploading : labels.upload;
        element('#cancel').hidden = !busy;
        element<HTMLButtonElement>('#load-file').disabled = busy || pickingFile;
        element('#selected-file').textContent = fileName ?? (hasFile ? labels.capturedFixture : labels.noFile);
        element('#selected-file').title = fileName ?? '';
    }
    element('#blob-form').addEventListener('input', event => {
        if (event.target !== guidance) {
            revision++;
        }
        updateControls();
    });
    const read = (): BlobInvocation => ({
        ...configuration.invocation, name: input('#name').value,
        request: {
            target: { kind: 'azurite', url: input('#target').value },
            container: input('#container').value, blobName: input('#blob-name').value,
            contentType: input('#content-type').value,
            encoding, content,
            ...(fileName === undefined ? {} : { fileName }),
        },
    });
    save.addEventListener('click', () => {
        pendingSave = revision;
        updateControls();
        api.postMessage({ command: 'saveBlob', invocation: read() });
    });
    element('#blob-form').addEventListener('submit', event => {
        event.preventDefault();
        busy = true;
        element('#error').hidden = true;
        element('#receipt').hidden = true;
        element('#upload-status').textContent = labels.uploading;
        updateControls();
        api.postMessage({ command: 'uploadBlob', invocation: read() });
    });
    element('#cancel').addEventListener('click', () => api.postMessage({ command: 'cancelUpload' }));
    element('#load-file').addEventListener('click', () => {
        pickingFile = true;
        element('#error').hidden = true;
        updateControls();
        api.postMessage({ command: 'loadFile' });
    });
    debug.addEventListener('click', () => {
        openingDebug = true;
        updateControls();
        element('#error').hidden = true;
        api.postMessage({ command: 'debugBlob', breakpointGuidance: guidance.value });
    });
    window.addEventListener('message', (event: MessageEvent<BlobViewMessage>) => {
        const message = event.data;
        if (message.command === 'focusBreakpointGuidance') {
            guidance.scrollIntoView({ block: 'nearest' });
            guidance.focus();
        } else if (message.command === 'saved') {
            savedRevision = pendingSave ?? savedRevision;
            pendingSave = undefined;
            element('h1').textContent = input('#name').value.trim();
        } else if (message.command === 'fileLoaded') {
            content = message.content;
            encoding = 'base64';
            fileName = message.fileName;
            hasFile = true;
            pickingFile = false;
            if (!input('#blob-name').value) {
                input('#blob-name').value = fileName;
            }
            revision++;
        } else if (message.command === 'fileSelectionCancelled') {
            pickingFile = false;
        } else if (message.command === 'uploadStarted') {
            busy = true;
            element('#receipt').hidden = true;
            element('#error').hidden = true;
            element('#notice').hidden = true;
            element('#upload-status').textContent = labels.uploading;
        } else if (message.command === 'uploadResult') {
            busy = false;
            const result = message.result;
            element('#upload-status').textContent = labels.uploaded;
            const receipt = element('#receipt');
            receipt.replaceChildren();
            for (const [label, value] of [
                [labels.bytes, result.bytes], [labels.duration, result.duration],
                [labels.etag, result.etag], [labels.lastModified, result.lastModified],
            ]) {
                const term = document.createElement('dt');
                const description = document.createElement('dd');
                term.textContent = String(label);
                description.textContent = value === undefined ? '' : String(value);
                receipt.append(term, description);
            }
            receipt.hidden = false;
        } else if (message.command === 'uploadError' || message.command === 'error') {
            if (message.command === 'uploadError' || busy) {
                element('#upload-status').textContent = message.command === 'uploadError' && message.cancelled ? labels.cancelled : labels.notConfirmed;
            }
            busy = false;
            openingDebug = false;
            pickingFile = false;
            pendingSave = undefined;
            element('#error').textContent = message.message;
            element('#error').hidden = false;
        } else if (message.command === 'notice') {
            openingDebug = false;
            element('#notice').textContent = message.message;
            element('#notice').hidden = false;
        }
        updateControls();
    });
    updateControls();
    api.postMessage({ command: 'ready' });
}
