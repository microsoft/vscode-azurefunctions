/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Latest run outcome of a saved invocation.
 */
export enum InvocationRunState {
    /**
     * No run status has been recorded in the current session.
     */
    NotRun = 'notRun',
    /**
     * Preparing or sending the request, including running its prerequisites.
     */
    Running = 'running',
    /**
     * Received an HTTP 2xx response; business assertions are not checked.
     */
    Succeeded = 'succeeded',
    /**
     * Preparation or transport failed, or the response was not HTTP 2xx.
     */
    Failed = 'failed',
    /**
     * Not sent because a prerequisite failed or has no current successful result.
     */
    Blocked = 'blocked',
    /**
     * The run was cancelled before it completed.
     */
    Cancelled = 'cancelled',
}

/**
 * An invocation's latest run, held in memory until the runner is cleared.
 */
export interface InvocationRunStatus {
    /**
     * Outcome of the latest attempt. An invocation that has never run has no status at all.
     */
    readonly state: Exclude<InvocationRunState, InvocationRunState.NotRun>;
    /**
     * Start time of the latest attempt, or the time it was marked blocked before starting.
     */
    readonly lastRun: Date;
    /**
     * HTTP status of the response. Set only when a response arrived.
     */
    readonly statusCode?: number;
    /**
     * Transport time in milliseconds. Set only when a response arrived.
     */
    readonly duration?: number;
}
