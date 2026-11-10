/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { copyBlobDefinition, type BlobUploadDefinition } from '../shared/blobInvocation';
import { type CollectionReviewConfiguration } from '../shared/collectionReview';

export class BlobRequestEditor {
    public readonly element = document.createElement('fieldset');
    private definition: BlobUploadDefinition;
    private readonly destination = document.createElement('p');
    private readonly fileLabel = document.createElement('span');
    private fileName: string | undefined;

    public constructor(
        request: BlobUploadDefinition,
        labels: CollectionReviewConfiguration['labels']['blob'],
        chooseFile: () => void,
    ) {
        this.definition = copyBlobDefinition(request);
        this.element.className = 'blob-request-editor';
        this.destination.className = 'endpoint';
        this.element.append(this.destination);
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
        return copyBlobDefinition(this.definition);
    }

    public setRequest(request: BlobUploadDefinition): void {
        this.definition = copyBlobDefinition(request);
        this.destination.textContent = `${this.definition.container}/${this.definition.blobName}`;
    }

    public setFileName(fileName: string): void {
        this.fileName = fileName;
        this.fileLabel.textContent = fileName;
        if (!this.definition.blobName) {
            this.setRequest({ ...this.definition, blobName: fileName });
        }
    }

    public get hasFile(): boolean {
        return this.fileName !== undefined;
    }

    public setEnabled(enabled: boolean): void {
        this.element.disabled = !enabled;
    }
}
