/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Options for a single `sendRequest` call.
 */
export interface InvocationRunOptions {
    /**
     * Cancellation owned by the caller. Aborting it stops the whole run.
     */
    signal?: AbortSignal;
    /**
     * Whether `invocation` is its saved definition. Passed through in the target's start message.
     */
    saved?: boolean;
    /**
     * Rerun prerequisites instead of requiring their current successful outputs.
     */
    runDependencies?: boolean;
}
