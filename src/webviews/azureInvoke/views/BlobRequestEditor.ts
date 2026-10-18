/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { copyBlobDefinition, type BlobUploadDefinition } from '../shared/blobInvocation';
import { type CollectionReviewConfiguration } from '../shared/collectionReview';

export class BlobRequestEditor {
    public readonly element = document.createElement('fieldset');
    private readonly inputs = {
        target: document.createElement('input'), container: document.createElement('input'),
        blobName: document.createElement('input'), contentType: document.createElement('input'),
    };
    private readonly fileLabel = document.createElement('span');
    private fileName: string | undefined;

    public constructor(
        request: BlobUploadDefinition,
        labels: CollectionReviewConfiguration['labels']['blob'],
        chooseFile: () => void,
        changed: () => void,
    ) {
        this.element.className = 'blob-request-editor';
        for (const key of ['target', 'container', 'blobName', 'contentType'] as const) {
            const label = document.createElement('label');
            label.className = 'request-field';
            const caption = document.createElement('span');
            caption.textContent = labels[key];
            const input = this.inputs[key];
            input.type = 'text';
            input.className = `blob-${key}`;
            input.addEventListener('input', changed);
            label.append(caption, input);
            this.element.append(label);
        }
        this.setRequest(request);
        const picker = document.createElement('button');
        picker.type = 'button';
        picker.className = 'secondary choose-blob-file';
        picker.textContent = labels.file;
        picker.addEventListener('click', chooseFile);
        this.fileLabel.className = 'blob-file-name';
        this.fileLabel.textContent = labels.noFile;
        const file = document.createElement('div');
        file.className = 'blob-file-picker';
        file.append(picker, this.fileLabel);
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = labels.hint;
        this.element.append(file, hint);
    }

    public get request(): BlobUploadDefinition {
        return {
            target: { kind: 'azurite', url: this.inputs.target.value },
            container: this.inputs.container.value,
            blobName: this.inputs.blobName.value,
            contentType: this.inputs.contentType.value,
        };
    }

    public setRequest(request: BlobUploadDefinition): void {
        const definition = copyBlobDefinition(request);
        for (const key of ['target', 'container', 'blobName', 'contentType'] as const) {
            this.inputs[key].value = key === 'target' ? definition.target.url : definition[key];
        }
    }

    public setFileName(fileName: string): void {
        this.fileName = fileName;
        this.fileLabel.textContent = fileName;
        const blobName = this.inputs.blobName;
        if (!blobName.value) {
            blobName.value = fileName;
        }
    }

    public get hasFile(): boolean {
        return this.fileName !== undefined;
    }

    public setEnabled(enabled: boolean): void {
        this.element.disabled = !enabled;
    }
}
