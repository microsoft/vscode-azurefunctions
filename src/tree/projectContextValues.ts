
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const contextValueSeparator: string = ';';
const contextValuePrefix: string = 'azFunc';

export enum ProjectSource {
    Remote = 'Remote',
    Local = 'Local'
}

export enum ProjectAccess {
    ReadOnly = 'ReadOnly',
    ReadWrite = 'ReadWrite'
}

export enum ProjectResource {
    Functions = 'Functions',
    Function = 'Function',
}

export function getProjectContextValue(source: ProjectSource, access: ProjectAccess, resource: ProjectResource, ...parts: string[]): string {
    return [contextValuePrefix, source, access, resource, ...parts].join(contextValueSeparator) + contextValueSeparator;
}

export function isProjectCV(contextValue: string | RegExp): boolean {
    const data: string = normalizeContextValue(contextValue);
    return data.includes(contextValueSeparator);
}

export function isRemoteProjectCV(contextValue: string | RegExp): boolean {
    return isProjectCV(contextValue) && (matchesAnyPart(contextValue, ProjectSource.Remote) || !matchesAnyPart(contextValue, ProjectSource.Local));
}

export function isLocalProjectCV(contextValue: string | RegExp): boolean {
    return isProjectCV(contextValue) && (matchesAnyPart(contextValue, ProjectSource.Local) || !matchesAnyPart(contextValue, ProjectSource.Remote));
}

export function matchesAnyPart(contextValue: string | RegExp, ...parts: string[]): boolean {
    const data: string = normalizeContextValue(contextValue);
    return parts.some(part => data.includes(part.toLowerCase() + contextValueSeparator));
}

function normalizeContextValue(contextValue: string | RegExp): string {
    const data: string = typeof contextValue === 'string' ? contextValue : contextValue.source;
    return data.toLowerCase();
}
