/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nodeDefaultModelVersion, pythonDefaultModelVersion, RuntimeNameToLanguageMapping } from '../constants';

export function getProjectLanguageFromRuntime(runtimeName: string): string | undefined {
    return RuntimeNameToLanguageMapping[runtimeName.toLowerCase()];
}

export function getLanguageModelFromRuntime(runtimeName: string): number | undefined {
    switch (runtimeName.toLowerCase()) {
        case 'node':
            return nodeDefaultModelVersion;
        case 'python':
            return pythonDefaultModelVersion;
        default:
            return undefined;
    }
}
