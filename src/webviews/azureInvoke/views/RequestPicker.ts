/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DependencyLabels, type InvocationSource } from '../shared/httpRequest';

let pickerNumber = 0;

export class RequestPicker {
    public readonly element = document.createElement('div');
    public readonly input = document.createElement('input');
    private readonly list = document.createElement('ul');
    private readonly empty = document.createElement('p');
    private matches: InvocationSource[] = [];
    private selected = '';
    private active = -1;

    public constructor(
        private sources: InvocationSource[],
        private readonly labels: DependencyLabels,
        private readonly onSelect: (id: string) => void,
    ) {
        this.element.className = 'request-picker';
        this.input.type = 'text';
        this.input.placeholder = labels.search;
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;
        this.input.setAttribute('role', 'combobox');
        this.input.setAttribute('aria-label', labels.source);
        this.input.setAttribute('aria-autocomplete', 'list');
        this.input.setAttribute('aria-expanded', 'false');
        this.list.id = `request-options-${++pickerNumber}`;
        this.list.className = 'request-options';
        this.list.setAttribute('role', 'listbox');
        this.list.setAttribute('aria-label', labels.selectSource);
        this.list.hidden = true;
        this.input.setAttribute('aria-controls', this.list.id);
        this.empty.className = 'request-picker-empty';
        this.empty.textContent = labels.noResults;
        this.empty.setAttribute('role', 'status');
        this.empty.hidden = true;
        this.input.addEventListener('focus', () => {
            this.input.select();
            this.show('');
        });
        this.input.addEventListener('input', () => this.show(this.input.value));
        this.input.addEventListener('blur', () => {
            this.close();
            this.set(this.selected);
        });
        this.input.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                this.close();
                this.set(this.selected);
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (this.input.getAttribute('aria-expanded') !== 'true') {
                    this.show('');
                }
                this.activate(event.key === 'ArrowDown' ? Math.min(this.active + 1, this.matches.length - 1) :
                    this.active < 0 ? this.matches.length - 1 : Math.max(this.active - 1, 0));
            } else if (event.key === 'Enter' && this.input.getAttribute('aria-expanded') === 'true') {
                event.preventDefault();
                const source = this.matches[this.active >= 0 ? this.active : 0];
                if (source) {
                    this.choose(source);
                }
            }
        });
        this.element.append(this.input, this.list, this.empty);
    }

    public get value(): string {
        return this.selected;
    }

    public set(id: string): void {
        this.selected = id;
        this.input.value = id ? this.sources.find(source => source.id === id)?.name ?? this.labels.unavailable : '';
    }

    public setSources(sources: InvocationSource[]): void {
        this.sources = sources;
        if (document.activeElement !== this.input) {
            this.set(this.selected);
        } else if (!this.list.hidden) {
            this.show(this.input.value);
        }
    }

    private choose(source: InvocationSource): void {
        if (this.input.matches(':disabled')) {
            return;
        }
        this.set(source.id);
        this.close();
        this.onSelect(source.id);
    }

    private show(query: string): void {
        const search = query.trim().toLowerCase();
        this.matches = this.sources.filter(source => source.name.toLowerCase().includes(search) || source.id.toLowerCase().includes(search));
        this.active = -1;
        this.input.removeAttribute('aria-activedescendant');
        this.list.replaceChildren();
        for (const [index, source] of this.matches.entries()) {
            const option = document.createElement('li');
            option.id = `${this.list.id}-${index}`;
            option.dataset.sourceId = source.id;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(source.id === this.selected));
            const name = document.createElement('span');
            name.textContent = source.name;
            const id = document.createElement('small');
            id.textContent = source.id;
            option.append(name, id);
            option.addEventListener('pointerdown', event => event.preventDefault());
            option.addEventListener('click', () => this.choose(source));
            this.list.append(option);
        }
        this.list.hidden = !this.matches.length;
        this.empty.hidden = !!this.matches.length;
        this.input.setAttribute('aria-expanded', 'true');
    }

    private activate(index: number): void {
        this.active = index;
        for (const [optionIndex, option] of [...this.list.children].entries()) {
            option.classList.toggle('active', optionIndex === index);
        }
        const option = this.list.children[index];
        if (option) {
            this.input.setAttribute('aria-activedescendant', option.id);
            option.scrollIntoView({ block: 'nearest' });
        }
    }

    private close(): void {
        this.list.hidden = true;
        this.empty.hidden = true;
        this.input.setAttribute('aria-expanded', 'false');
        this.input.removeAttribute('aria-activedescendant');
    }
}
