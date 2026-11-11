/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type TimerInvocation, type TimerViewConfiguration, type TimerViewMessage } from '../shared/timerInvocation';
import './httpRequestView.css';
import './timerInvocation.css';

export function render(_viewName: string, api: { postMessage(message: unknown): void }): void {
    const configuration: TimerViewConfiguration = JSON.parse(decodeURIComponent(window.config._initialData));
    const { labels, invocation } = configuration;
    const element = <T extends HTMLElement>(selector: string): T => {
        const value = document.querySelector<T>(selector);
        if (!value) {
            throw new Error(`Missing Timer editor element: ${selector}`);
        }
        return value;
    };
    element('#root').innerHTML = `
        <main>
            <header><div class="title-group"><h1></h1><span class="subtitle" data-label="subtitle"></span></div>
                <div class="save-actions"><span id="save-status" role="status"></span><button id="save" class="secondary" data-label="save"></button></div>
            </header>
            <form id="timer-form">
                <label><span data-label="name"></span><input id="name" required maxlength="100" spellcheck="false"></label>
                <label><span data-label="hostUrl"></span><input id="host-url" type="url" required spellcheck="false"></label>
                <label><span data-label="functionName"></span><input id="function-name" required maxlength="128" spellcheck="false"></label>
                <div class="timer-schedule"><span data-label="schedule"></span><code id="schedule"></code></div>
                <p class="hint" data-label="scheduleHint"></p>
                <label><span data-label="guidance"></span><textarea id="breakpoint-guidance" rows="3" maxlength="500" spellcheck="false"></textarea></label>
                <div class="timer-actions"><button id="run" type="submit" data-label="run"></button>
                    <button id="cancel" type="button" class="secondary" data-label="cancel" hidden></button>
                    <button id="debug" type="button" class="secondary" data-label="debug"></button>
                </div>
            </form>
            <p id="notice" role="status" hidden></p><p id="error" role="alert" hidden></p>
            <section class="response-section"><h2 data-label="result"></h2>
                <p id="invocation-status" role="status"></p><dl id="receipt" hidden></dl>
            </section>
        </main>`;
    for (const item of document.querySelectorAll<HTMLElement>('[data-label]')) {
        item.textContent = labels[item.dataset.label ?? ''];
    }
    const name = element<HTMLInputElement>('#name');
    const host = element<HTMLInputElement>('#host-url');
    const functionName = element<HTMLInputElement>('#function-name');
    const guidance = element<HTMLTextAreaElement>('#breakpoint-guidance');
    const save = element<HTMLButtonElement>('#save');
    const run = element<HTMLButtonElement>('#run');
    const debug = element<HTMLButtonElement>('#debug');
    name.value = invocation.name;
    host.value = invocation.request.hostUrl;
    functionName.value = invocation.request.functionName;
    element('h1').textContent = invocation.name;
    element('#schedule').textContent = invocation.request.schedule || labels.unknownSchedule;
    guidance.placeholder = labels.guidancePlaceholder;
    guidance.title = labels.guidancePrivacy;
    let revision = 0;
    let savedRevision = configuration.saved ? 0 : -1;
    let saving: number | undefined;
    let busy = false;
    let openingDebug = false;
    function updateControls(): void {
        save.disabled = busy || saving !== undefined || revision === savedRevision;
        save.textContent = saving === undefined ? labels.save : labels.saving;
        element('#save-status').textContent = revision === savedRevision ? labels.saved : labels.unsaved;
        run.disabled = busy || openingDebug;
        run.textContent = busy ? labels.running : labels.run;
        debug.disabled = busy || openingDebug || saving !== undefined || revision !== savedRevision || guidance.value.length > guidance.maxLength;
        guidance.disabled = busy || openingDebug;
        element('#cancel').hidden = !busy;
    }
    const read = (): TimerInvocation => ({
        ...invocation, name: name.value,
        request: { hostUrl: host.value, functionName: functionName.value, schedule: invocation.request.schedule },
    });
    element('#timer-form').addEventListener('input', event => {
        if (event.target !== guidance) {
            revision++;
        }
        updateControls();
    });
    save.addEventListener('click', () => {
        saving = revision;
        updateControls();
        api.postMessage({ command: 'saveTimer', invocation: read() });
    });
    element('#timer-form').addEventListener('submit', event => {
        event.preventDefault();
        busy = true;
        element('#error').hidden = true;
        updateControls();
        api.postMessage({ command: 'runTimer', invocation: read() });
    });
    element('#cancel').addEventListener('click', () => api.postMessage({ command: 'cancelInvocation' }));
    debug.addEventListener('click', () => {
        openingDebug = true;
        element('#error').hidden = true;
        updateControls();
        api.postMessage({ command: 'debugTimer', breakpointGuidance: guidance.value });
    });
    window.addEventListener('message', (event: MessageEvent<TimerViewMessage>) => {
        const message = event.data;
        if (message.command === 'saved') {
            savedRevision = saving ?? savedRevision;
            saving = undefined;
            element('h1').textContent = name.value.trim();
        } else if (message.command === 'focusBreakpointGuidance') {
            guidance.scrollIntoView({ block: 'nearest' });
            guidance.focus();
        } else if (message.command === 'invocationStarted') {
            busy = true;
            element('#error').hidden = true;
            element('#notice').hidden = true;
            element('#receipt').hidden = true;
            element('#invocation-status').textContent = labels.running;
        } else if (message.command === 'invocationResult') {
            busy = false;
            element('#invocation-status').textContent = labels.accepted;
            const receipt = element('#receipt');
            receipt.replaceChildren();
            for (const [label, value] of [[labels.status, message.result.status], [labels.duration, message.result.duration]]) {
                const term = document.createElement('dt');
                const description = document.createElement('dd');
                term.textContent = String(label);
                description.textContent = String(value);
                receipt.append(term, description);
            }
            receipt.hidden = false;
        } else if (message.command === 'invocationError' || message.command === 'error') {
            busy = false;
            openingDebug = false;
            saving = undefined;
            element('#invocation-status').textContent = labels.notConfirmed;
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
