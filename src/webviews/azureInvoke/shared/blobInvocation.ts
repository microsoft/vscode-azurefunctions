/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type HttpInvocation, isInvocationName } from './httpRequest';

export interface BlobUploadRequest {
    target: { kind: 'azurite'; url: string };
    container: string;
    blobName: string;
    content: string;
    encoding: 'utf8' | 'base64';
    contentType: string;
    fileName?: string;
}

export interface BlobInvocation {
    readonly id: string;
    readonly name: string;
    readonly group?: string;
    readonly trigger: 'blob';
    readonly request: BlobUploadRequest;
}

export type BlobUploadDefinition = Pick<BlobUploadRequest, 'target' | 'container' | 'blobName' | 'contentType'>;
export type BlobFixtureFile = Pick<BlobUploadRequest, 'content'> & { fileName: string };

export function copyBlobDefinition(request: BlobUploadDefinition): BlobUploadDefinition {
    return {
        target: { kind: request.target.kind, url: request.target.url },
        container: request.container, blobName: request.blobName, contentType: request.contentType,
    };
}

export type Invocation = HttpInvocation | BlobInvocation;

export function isBlobInvocation(value: unknown): value is BlobInvocation {
    return !!value && typeof value === 'object' && 'trigger' in value && value.trigger === 'blob' &&
        'id' in value && typeof value.id === 'string' && !!value.id && value.id.length <= 100 &&
        'name' in value && isInvocationName(value.name) &&
        (!('group' in value) || value.group === undefined || isInvocationName(value.group)) &&
        'request' in value && isBlobUploadRequest(value.request);
}

export function isBlobUploadRequest(value: unknown): value is BlobUploadRequest {
    return !!value && typeof value === 'object' &&
        'target' in value && !!value.target && typeof value.target === 'object' &&
        'kind' in value.target && value.target.kind === 'azurite' && 'url' in value.target && typeof value.target.url === 'string' &&
        'container' in value && typeof value.container === 'string' &&
        'blobName' in value && typeof value.blobName === 'string' &&
        'content' in value && typeof value.content === 'string' &&
        'encoding' in value && (value.encoding === 'utf8' || value.encoding === 'base64') &&
        'contentType' in value && typeof value.contentType === 'string' &&
        (!('fileName' in value) || value.fileName === undefined ||
            (typeof value.fileName === 'string' && value.fileName.length > 0 && value.fileName.length <= 1024));
}

export function copyBlobInvocation(invocation: BlobInvocation): BlobInvocation {
    return {
        id: invocation.id, name: invocation.name.trim(), trigger: 'blob',
        ...(invocation.group === undefined ? {} : { group: invocation.group.trim() }),
        request: {
            target: { kind: invocation.request.target.kind, url: invocation.request.target.url },
            container: invocation.request.container, blobName: invocation.request.blobName,
            content: invocation.request.content, encoding: invocation.request.encoding, contentType: invocation.request.contentType,
            ...(invocation.request.fileName === undefined ? {} : { fileName: invocation.request.fileName }),
        },
    };
}

export function isValidAzuriteTarget(value: string): boolean {
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') &&
            (url.hostname === 'localhost' || url.hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(url.hostname)) &&
            /^\/devstoreaccount1\/?$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash;
    } catch {
        return false;
    }
}

export function isValidBlobFixture(request: BlobUploadRequest): boolean {
    const content = request.content;
    if (content.length > 7 * 1024 * 1024) {
        return false;
    }
    const bytes = request.encoding === 'utf8' ? new TextEncoder().encode(content).byteLength :
        content.length / 4 * 3 - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0);
    return isValidAzuriteTarget(request.target.url) &&
        /^(?!.*--)[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(request.container) &&
        request.blobName.length > 0 && request.blobName.length <= 1024 && ![...request.blobName].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
        request.contentType.length > 0 && request.contentType.length <= 256 && !/[^\x20-\x7e]/.test(request.contentType) &&
        bytes <= 5 * 1024 * 1024 &&
        (request.encoding === 'utf8' || (content.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(content)));
}

export interface BlobUploadResult {
    status: 'uploaded';
    duration: number;
    bytes: number;
    etag?: string;
    lastModified?: string;
    functionExecution: 'notObserved';
}

export type BlobUploadState =
    | { command: 'uploadStarted' }
    | { command: 'uploadResult'; result: BlobUploadResult }
    | { command: 'uploadError'; message: string; cancelled: boolean };

export interface BlobViewConfiguration {
    invocation: BlobInvocation;
    saved: boolean;
    labels: Record<string, string>;
}

export type BlobViewMessage = BlobUploadState
    | { command: 'saved' }
    | { command: 'fileLoaded'; content: string; fileName: string }
    | { command: 'fileSelectionCancelled' }
    | { command: 'notice'; message: string }
    | { command: 'error'; message: string };
