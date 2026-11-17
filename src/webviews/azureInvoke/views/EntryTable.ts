/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type HttpRequestEntry, type HttpRequestViewLabels } from '../shared/httpRequest';

/** Editable name, value, and enabled rows for query parameters or headers. */
export class EntryTable {
    public constructor(
        private readonly rows: HTMLElement,
        private readonly addButton: HTMLButtonElement,
        entries: HttpRequestEntry[],
        private readonly labels: Pick<HttpRequestViewLabels, 'name' | 'value' | 'enabled' | 'remove'>,
        private readonly onChange: () => void,
    ) {
        if (entries.length) {
            entries.forEach(entry => this.append(entry));
        } else {
            this.append();
        }
        addButton.addEventListener('click', () => {
            this.append();
            this.onChange();
            rows.lastElementChild?.querySelector('input')?.focus();
        });
    }

    public read(): HttpRequestEntry[] {
        return Array.from(this.rows.children, row => {
            const [name, value, enabled] = row.querySelectorAll('input');
            return {
                name: name.value,
                value: value.value,
                // Omit the default so untouched rows round-trip without an explicit flag.
                ...((row instanceof HTMLElement && row.dataset.explicitEnabled === 'true') || !enabled.checked ? { enabled: enabled.checked } : {}),
            };
        });
    }

    private append(entry?: HttpRequestEntry): void {
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.dataset.explicitEnabled = String(entry?.enabled !== undefined);
        const name = this.createInput(this.labels.name, entry?.name);
        const value = this.createInput(this.labels.value, entry?.value);
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = entry?.enabled !== false;
        enabled.setAttribute('aria-label', this.labels.enabled);
        value.addEventListener('input', () => {
            if (value.value) {
                enabled.checked = true;
            }
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary';
        remove.textContent = '\u00d7';
        remove.title = this.labels.remove;
        remove.setAttribute('aria-label', this.labels.remove);
        remove.addEventListener('click', () => {
            row.remove();
            this.onChange();
            this.addButton.focus();
        });
        row.append(name, value, enabled, remove);
        this.rows.append(row);
    }

    private createInput(label: string, value = ''): HTMLInputElement {
        const input = document.createElement('input');
        input.placeholder = label;
        input.setAttribute('aria-label', label);
        input.spellcheck = false;
        input.value = value;
        return input;
    }
}
