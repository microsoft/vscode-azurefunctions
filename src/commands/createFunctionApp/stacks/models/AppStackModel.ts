/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Types copied from here:
// https://github.com/Azure/azure-functions-ux/blob/fa150ffa944e93c6d08cc9798b558e7095febee3/server/src/stacks/2020-10-01/models/AppStackModel.ts
// tslint:disable: interface-name

export interface AppStack<T, V> {
    displayText: string;
    value: V;
    majorVersions: AppStackMajorVersion<T>[];
    preferredOs?: AppStackOs;
}

export interface AppStackMajorVersion<T> {
    displayText: string;
    value: string;
    minorVersions: AppStackMinorVersion<T>[];
}

export interface AppStackMinorVersion<T> {
    displayText: string;
    value: string;
    stackSettings: T;
}

export type AppStackOs = 'linux' | 'windows';

export interface AppInsightsSettings {
    isSupported: boolean;
    isDefaultOff?: boolean;
}

export interface GitHubActionSettings {
    isSupported: boolean;
    supportedVersion?: string;
}

export interface CommonSettings {
    isPreview?: boolean;
    isDeprecated?: boolean;
    isHidden?: boolean;
    endOfLifeDate?: string;
    isAutoUpdate?: boolean;
    isDefault?: boolean;
}
