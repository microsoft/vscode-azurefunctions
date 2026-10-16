/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DependencyLabels, type HttpRequest, type HttpResponseBinding, type InvocationSource } from '../shared/httpRequest';
import { RequestPicker } from './RequestPicker';

export class ResponseBindingsEditor {
    public readonly element = document.createElement('section');
    private readonly prerequisites = document.createElement('div');
    private readonly list = document.createElement('div');
    private readonly add = document.createElement('button');
    private readonly explicit = new Set<string>();
    private readonly rows: { name: HTMLInputElement; source: RequestPicker; pointer: HTMLInputElement }[] = [];
    private readonly prerequisitePicker: RequestPicker;
    private sources: InvocationSource[];

    public constructor(
        request: HttpRequest,
        sources: InvocationSource[],
        private readonly labels: DependencyLabels,
        private readonly onChange: () => void,
    ) {
        this.element.className = 'response-bindings';
        this.sources = sources;
        this.prerequisitePicker = new RequestPicker(sources, labels, id => {
            this.explicit.add(id);
            this.prerequisitePicker.set('');
            this.updatePrerequisites();
            this.onChange();
        });
        this.prerequisitePicker.input.setAttribute('aria-label', labels.prerequisites);
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = labels.hint;
        const heading = document.createElement('h3');
        heading.textContent = labels.prerequisites;
        this.prerequisites.className = 'prerequisite-list';
        const valuesHeading = document.createElement('h3');
        valuesHeading.textContent = labels.values;
        this.add.type = 'button';
        this.add.className = 'secondary';
        this.add.textContent = labels.add;
        this.add.addEventListener('click', () => {
            this.append({ name: '', sourceId: '', pointer: '/body/id' });
            this.onChange();
            this.rows[this.rows.length - 1].name.focus();
        });
        this.element.append(hint, heading, this.prerequisitePicker.element, this.prerequisites, valuesHeading, this.list, this.add);
        this.set(request);
    }

    public read(): Pick<HttpRequest, 'bindings' | 'dependsOn'> {
        return {
            ...(this.rows.length ? { bindings: this.rows.map(row => ({ name: row.name.value, sourceId: row.source.value, pointer: row.pointer.value })) } : {}),
            ...(this.explicit.size ? { dependsOn: [...this.explicit] } : {}),
        };
    }

    public set(request: HttpRequest): void {
        this.explicit.clear();
        request.dependsOn?.forEach(id => this.explicit.add(id));
        this.rows.length = 0;
        this.list.replaceChildren();
        this.add.disabled = false;
        request.bindings?.forEach(binding => this.append(binding));
        this.updatePrerequisites();
    }

    public setSources(sources: InvocationSource[]): void {
        this.sources = sources;
        for (const row of this.rows) {
            row.source.setSources(sources);
        }
        this.updatePrerequisites();
    }

    private append(binding: HttpResponseBinding): void {
        const element = document.createElement('div');
        element.className = 'binding-row';
        const name = document.createElement('input');
        name.value = binding.name;
        name.placeholder = 'accountId';
        name.maxLength = 64;
        const source = new RequestPicker(this.sources, this.labels, () => {
            this.updatePrerequisites();
            this.onChange();
        });
        source.set(binding.sourceId);
        const pointer = document.createElement('input');
        pointer.value = binding.pointer;
        pointer.placeholder = '/body/id';
        pointer.maxLength = 1000;
        for (const [control, text] of [[name, this.labels.name], [source.element, this.labels.source], [pointer, this.labels.pointer]] as const) {
            const label = document.createElement('label');
            const caption = document.createElement('span');
            caption.textContent = text;
            label.append(caption, control);
            element.append(label);
            if (control !== source.element) {
                control.addEventListener('input', () => {
                    this.updatePrerequisites();
                    this.onChange();
                });
            }
        }
        const row = { name, source, pointer };
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary';
        remove.textContent = '\u00d7';
        remove.setAttribute('aria-label', this.labels.remove);
        remove.addEventListener('click', () => {
            this.rows.splice(this.rows.indexOf(row), 1);
            element.remove();
            this.add.disabled = false;
            this.updatePrerequisites();
            this.onChange();
            this.add.focus();
        });
        element.append(remove);
        this.list.append(element);
        this.rows.push(row);
        this.add.disabled = this.rows.length >= 100;
        this.updatePrerequisites();
    }

    private updatePrerequisites(): void {
        const linked = new Set(this.rows.map(row => row.source.value).filter(Boolean));
        const selected = new Set([...this.explicit, ...linked]);
        const sources = [...selected].map(id => this.sources.find(source => source.id === id) ?? { id, name: this.labels.unavailable });
        this.prerequisitePicker.setSources(this.sources.filter(source => !selected.has(source.id)));
        this.prerequisites.replaceChildren();
        for (const source of sources) {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.explicit.has(source.id) || linked.has(source.id);
            checkbox.disabled = linked.has(source.id);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.explicit.add(source.id);
                } else {
                    this.explicit.delete(source.id);
                }
                this.updatePrerequisites();
                this.onChange();
            });
            label.append(checkbox, document.createTextNode(source.name));
            this.prerequisites.append(label);
        }
    }
}
