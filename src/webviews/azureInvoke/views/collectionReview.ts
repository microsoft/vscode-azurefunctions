/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSupportedInvocationCandidate, type CollectionReviewConfiguration, type CollectionReviewMessage, type CollectionReviewResponse, type CollectionReviewState, type InvocationCandidate, type InvocationSelection } from '../shared/collectionReview';
import { HttpRequestPreview } from './HttpRequestPreview';
import { BlobRequestEditor } from './BlobRequestEditor';
import { getRequestDependencies } from '../shared/httpRequest';
import './collectionReview.css';

export function render(_viewName: string, api: { postMessage(message: CollectionReviewMessage): void }): void {
    const config: CollectionReviewConfiguration = JSON.parse(decodeURIComponent(window.config._initialData));
    const { labels } = config;
    const main = document.createElement('main');
    const loading = document.createElement('div');
    loading.className = 'review-loading';
    loading.id = 'review-loading';
    loading.setAttribute('role', 'status');
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const loadingTitle = document.createElement('h1');
    loadingTitle.textContent = labels.loadingTitle;
    const loadingMessage = document.createElement('p');
    loadingMessage.className = 'hint';
    loadingMessage.textContent = labels.loadingMessage;
    loading.append(spinner, loadingTitle, loadingMessage);
    const heading = document.createElement('h1');
    heading.textContent = labels.title;
    const introduction = document.createElement('p');
    introduction.className = 'hint';
    introduction.textContent = labels.introduction;
    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'select-all';
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    selectAllLabel.append(selectAll, document.createTextNode(labels.selectAll));
    const list = document.createElement('div');
    list.className = 'case-list';
    let rows: { candidate: InvocationCandidate; checkbox: HTMLInputElement; toggle: HTMLButtonElement; status: HTMLElement; warning: HTMLElement; requirement: HTMLElement; details: HTMLElement; preview?: HttpRequestPreview; blob?: BlobRequestEditor; locked: boolean }[] = [];
    const footer = document.createElement('footer');
    const count = document.createElement('span');
    count.setAttribute('role', 'status');
    const confirm = document.createElement('button');
    confirm.id = 'confirm-collection';
    confirm.textContent = labels.confirm;
    const diagnosisNotice = document.createElement('p');
    diagnosisNotice.id = 'diagnosis-notice';
    diagnosisNotice.setAttribute('role', 'status');
    const cancel = document.createElement('button');
    cancel.id = 'cancel-collection';
    cancel.className = 'secondary';
    cancel.textContent = labels.cancel;
    const message = document.createElement('p');
    message.id = 'review-message';
    message.setAttribute('role', 'status');
    const error = document.createElement('p');
    error.id = 'review-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    let state: CollectionReviewState = config.loading ? 'loading' : 'reviewing';
    let submitting = false;
    let diagnosing = false;
    let selectingBlobFile = false;
    let validationError = false;
    let version = -1;
    function setStatus(element: HTMLElement, trigger: InvocationCandidate['trigger'], text?: string): void {
        element.textContent = labels.triggers[trigger];
        element.title = text ? `${labels.triggers[trigger]} / ${text}` : labels.triggers[trigger];
    }
    function populate(candidates: InvocationCandidate[], nextVersion: number, selections?: InvocationSelection[]): void {
        if (nextVersion <= version) {
            return;
        }
        version = nextVersion;
        const expanded = new Set(rows.filter(row => row.toggle.getAttribute('aria-expanded') === 'true').map(row => row.candidate.id));
        const groups = new Map<string, HTMLElement>();
        list.replaceChildren();
        rows = candidates.map((candidate, index) => {
            const groupName = candidate.group.trim();
            const groupKey = groupName.toLowerCase();
            let group = groups.get(groupKey);
            if (!group) {
                group = document.createElement('section');
                group.className = 'case-group';
                const groupHeading = document.createElement('h2');
                groupHeading.className = 'group-heading';
                groupHeading.id = `case-group-${groups.size}`;
                groupHeading.textContent = groupName;
                group.setAttribute('aria-labelledby', groupHeading.id);
                group.append(groupHeading);
                groups.set(groupKey, group);
                list.append(group);
            }
            const card = document.createElement('section');
            card.className = 'case';
            card.dataset.id = candidate.id;
            const summary = document.createElement('div');
            summary.className = 'case-row';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.caseId = candidate.id;
            checkbox.setAttribute('aria-label', candidate.name);
            const selection = selections?.find(selection => selection.id === candidate.id);
            const supported = isSupportedInvocationCandidate(candidate);
            checkbox.checked = supported && (selection?.selected ?? true);
            checkbox.disabled = !supported;
            checkbox.addEventListener('change', updateSelection);
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'case-toggle';
            toggle.setAttribute('aria-expanded', String(expanded.has(candidate.id)));
            const chevron = document.createElement('span');
            chevron.className = 'case-chevron';
            chevron.setAttribute('aria-hidden', 'true');
            const title = document.createElement('span');
            title.className = 'case-name';
            title.textContent = candidate.name;
            title.title = candidate.name;
            toggle.append(chevron, title);
            if (candidate.trigger === 'http') {
                const auth = document.createElement('span');
                auth.className = `auth-indicator auth-${candidate.auth}`;
                auth.title = labels[candidate.auth];
                auth.setAttribute('aria-label', labels[candidate.auth]);
                const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                icon.setAttribute('viewBox', '0 0 16 16');
                icon.setAttribute('aria-hidden', 'true');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', candidate.auth === 'unknown' ?
                    'M6 5a2 2 0 1 1 3 1.7C8 7.3 8 8 8 9M8 11v1' :
                    candidate.auth === 'anonymous' ? 'M5 7V5a3 3 0 0 1 5.8-1M4 7h8v7H4Z' : 'M5 7V5a3 3 0 0 1 6 0v2M4 7h8v7H4Z');
                icon.append(path);
                auth.append(icon);
                toggle.append(auth);
            }
            const status = document.createElement('span');
            status.className = 'case-status';
            status.setAttribute('role', 'status');
            setStatus(status, candidate.trigger, candidate.trigger === 'blob' || candidate.trigger === 'timer' ? labels.blob.manualOnly :
                candidate.trigger === 'http' ? undefined : labels.unsupported);
            const details = document.createElement('div');
            details.className = 'case-details';
            details.id = `case-details-${index}`;
            details.hidden = !expanded.has(candidate.id);
            toggle.setAttribute('aria-controls', details.id);
            const warning = document.createElement('span');
            warning.className = 'case-warning';
            warning.title = labels.blob.fileRequired;
            warning.setAttribute('role', 'img');
            warning.setAttribute('aria-label', labels.blob.fileRequired);
            const warningIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            warningIcon.setAttribute('viewBox', '0 0 16 16');
            warningIcon.setAttribute('aria-hidden', 'true');
            const warningPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            warningPath.setAttribute('d', 'M8 1.5 15 14H1ZM8 5.5v4M8 11v1');
            warningIcon.append(warningPath);
            warning.append(warningIcon);
            toggle.append(warning);
            const requirement = document.createElement('p');
            requirement.className = 'case-requirement';
            requirement.id = `case-requirement-${index}`;
            requirement.textContent = labels.blob.fileRequired;
            details.append(requirement);
            toggle.addEventListener('click', () => {
                details.hidden = !details.hidden;
                toggle.setAttribute('aria-expanded', String(!details.hidden));
            });
            const description = document.createElement('p');
            description.className = 'case-description';
            description.textContent = candidate.description;
            if (config.updatingSaved || !supported) {
                details.append(description);
            }
            let preview: HttpRequestPreview | undefined;
            let blob: BlobRequestEditor | undefined;
            if (candidate.trigger === 'http' && config.updatingSaved) {
                preview = new HttpRequestPreview(candidate, labels,
                    (request, runDependencies) => api.postMessage({
                        command: 'previewRequest', id: candidate.id, request, runDependencies,
                        requests: rows.flatMap(row => row.preview ? [{ id: row.candidate.id, request: row.preview.request }] : []),
                    }),
                    () => api.postMessage({ command: 'cancelPreview', id: candidate.id }),
                    updateSelection,
                    candidates.filter(source => source.trigger === 'http' && source.id !== candidate.id).map(({ id, name }) => ({ id, name })));
                if (selection?.request) {
                    preview.setRequest(selection.request);
                }
                details.append(preview.element);
            } else if (candidate.trigger === 'blob') {
                blob = new BlobRequestEditor(selection?.blobRequest ?? candidate.request, labels.blob,
                    () => api.postMessage({ command: 'selectBlobFile', id: candidate.id }));
                const file = config.blobFiles?.find(file => file.id === candidate.id);
                if (file) {
                    blob.setFileName(file.fileName);
                }
                details.append(blob.element);
            } else if (candidate.trigger === 'timer') {
                const endpoint = document.createElement('p');
                endpoint.className = 'endpoint';
                endpoint.textContent = candidate.request.functionName;
                const schedule = document.createElement('p');
                schedule.className = 'hint';
                schedule.textContent = `${labels.timer.schedule}: ${candidate.request.schedule || labels.none}`;
                details.append(endpoint, schedule);
            } else {
                const endpoint = document.createElement('p');
                endpoint.className = 'endpoint';
                endpoint.textContent = candidate.trigger === 'http' ? `${candidate.request.method} ${candidate.request.url}` :
                    `${candidate.trigger.toUpperCase()} ${candidate.endpoint}`;
                details.append(endpoint);
                if (candidate.trigger === 'http') {
                    const dependencies = getRequestDependencies(candidate.request);
                    if (dependencies.length) {
                        const prerequisites = document.createElement('p');
                        prerequisites.className = 'hint case-prerequisites';
                        prerequisites.textContent = `${labels.dependencies.title}: ${dependencies.map(id => candidates.find(source => source.id === id)?.name ?? id).join(', ')}`;
                        details.append(prerequisites);
                    }
                }
            }
            summary.append(checkbox, toggle, status);
            card.append(summary, details);
            group.append(card);
            return { candidate, checkbox, toggle, status, warning, requirement, details, preview, blob, locked: false };
        });
        updateSelection();
    }

    function updateSelection(): void {
        const selected = rows.filter(row => row.checkbox.checked);
        const supported = rows.filter(row => isSupportedInvocationCandidate(row.candidate));
        count.textContent = `${labels.selected}: ${selected.length}`;
        const running = rows.some(row => row.preview?.running);
        if (validationError && selected.length && !selected.some(row => row.blob && !row.blob.hasFile)) {
            error.hidden = true;
            validationError = false;
        }
        for (const row of rows) {
            const missingFile = state === 'reviewing' && row.checkbox.checked && !!row.blob && !row.blob.hasFile;
            row.warning.hidden = !missingFile;
            row.requirement.hidden = !missingFile;
            if (missingFile) {
                row.toggle.setAttribute('aria-describedby', row.requirement.id);
            } else {
                row.toggle.removeAttribute('aria-describedby');
            }
        }
        confirm.disabled = submitting || diagnosing || selectingBlobFile || (state !== 'reviewing' && state !== 'approved') || running;
        selectAll.checked = !!supported.length && selected.length === supported.length;
        selectAll.indeterminate = !!selected.length && selected.length < supported.length;
        selectAll.disabled = diagnosing || state !== 'reviewing' || !supported.length;
        confirm.title = labels.confirm;
    }
    function updateState(): void {
        const discovering = state === 'loading' || state === 'revising';
        loadingTitle.textContent = state === 'revising' ? labels.revisingTitle : labels.loadingTitle;
        loadingMessage.textContent = state === 'revising' ? labels.revisingMessage : labels.loadingMessage;
        loading.hidden = !discovering;
        main.classList.toggle('is-loading', discovering);
        main.setAttribute('aria-busy', String(discovering));
        heading.hidden = discovering;
        introduction.hidden = discovering;
        selectAllLabel.hidden = state !== 'reviewing';
        list.hidden = discovering || state === 'failed';
        count.hidden = discovering || state === 'failed';
        confirm.hidden = state !== 'reviewing' && !(state === 'approved' && !error.hidden);
        cancel.hidden = state === 'approved' || state === 'cancelled';
        message.textContent = state === 'approved' ? labels.approved : state === 'cancelled' ? labels.cancelled : '';
        updateSelection();
    }
    selectAll.addEventListener('change', () => {
        for (const row of rows) {
            if (isSupportedInvocationCandidate(row.candidate)) {
                row.checkbox.checked = selectAll.checked;
            }
        }
        updateSelection();
    });
    confirm.addEventListener('click', () => {
        const selected = rows.filter(row => row.checkbox.checked);
        const incomplete = selected.filter(row => row.blob && !row.blob.hasFile);
        if (!selected.length || incomplete.length) {
            validationError = true;
            error.textContent = !selected.length ? labels.selectCases : labels.blob.fileRequired;
            error.hidden = false;
            for (const row of incomplete) {
                row.details.hidden = false;
                row.toggle.setAttribute('aria-expanded', 'true');
            }
            if (incomplete.length) {
                incomplete[0].details.querySelector<HTMLButtonElement>('.choose-blob-file')?.focus();
            } else {
                selectAll.focus();
            }
            return;
        }
        submitting = true;
        error.hidden = true;
        updateSelection();
        api.postMessage({
            command: 'confirmCollection',
            selections: selected.filter(row => isSupportedInvocationCandidate(row.candidate))
                .map(row => ({ id: row.candidate.id, comment: '', request: row.preview?.request, blobRequest: row.blob?.request, selected: true })),
        });
    });
    cancel.addEventListener('click', () => api.postMessage({ command: 'cancelCollection' }));
    window.addEventListener('message', (event: MessageEvent<CollectionReviewResponse>) => {
        const response = event.data;
        if (response.command === 'proposal') {
            populate(response.candidates, response.version, response.selections);
        }
        if (response.command === 'state' || response.command === 'proposal') {
            if (response.version !== version) {
                return;
            }
            state = response.state;
            diagnosing = response.diagnosing;
            selectingBlobFile = response.selectingBlobFile;
            diagnosisNotice.textContent = response.diagnosisNotice ?? '';
            submitting = false;
            validationError = false;
            error.textContent = response.error ?? '';
            error.hidden = !response.error;
            for (const row of rows) {
                const selection = response.selections.find(selection => selection.id === row.candidate.id);
                if (selection && (!row.locked || state === 'approved' || state === 'revising')) {
                    row.checkbox.checked = selection.selected ?? true;
                    if (selection.request) {
                        row.preview?.setRequest(selection.request);
                    }
                    if (selection.blobRequest) {
                        row.blob?.setRequest(selection.blobRequest);
                    }
                    row.locked = true;
                } else if (state === 'approved' && !selection) {
                    row.checkbox.checked = false;
                }
                const file = response.blobFiles.find(file => file.id === row.candidate.id);
                if (file) {
                    row.blob?.setFileName(file.fileName);
                }
                row.checkbox.disabled = diagnosing || state !== 'reviewing' || !isSupportedInvocationCandidate(row.candidate);
                row.preview?.setEnabled(!diagnosing && state === 'reviewing');
                row.blob?.setEnabled(!diagnosing && !selectingBlobFile && state === 'reviewing');
                const status = response.statuses.find(status => status.id === row.candidate.id);
                if (status) {
                    setStatus(row.status, row.candidate.trigger, status.text);
                }
            }
            updateState();
        } else if (response.command === 'preview' && response.version === version) {
            rows.find(row => row.candidate.id === response.id)?.preview?.update(response.message);
        }
    });
    footer.append(count, confirm, cancel);
    main.append(loading, heading, introduction, selectAllLabel, list, diagnosisNotice, message, error, footer);
    const root = document.querySelector('#root');
    if (!root) {
        throw new Error('Missing collection review root element.');
    }
    root.replaceChildren(main);
    populate(config.candidates, config.version, config.selections);
    updateState();
    api.postMessage({ command: 'ready' });
}
