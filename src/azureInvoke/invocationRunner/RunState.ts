/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type InvocationRunner } from './InvocationRunner';
import { type HttpInvocationResult } from '../triggers/http/resolveRequestBindings';
import { type InvocationRunStatus } from './InvocationRunStatus';

/**
 * Everything the runner tracks for the open collection. `clear()` swaps in a fresh instance instead of
 * emptying this one, so a run that finishes after the swap writes into the instance it started with,
 * which nothing reads anymore.
 */
export class RunState {
    /** One single-request runner per invocation ID, shared by everything that sends, watches, or cancels that invocation. */
    public readonly invocationRunners = new Map<string, InvocationRunner>();
    /** Latest successful output per invocation ID. Read it through `getOutput`, which drops stale entries. */
    public readonly outputs = new Map<string, RunOutput>();
    /** IDs that an in-progress `sendRequest` will send. Claimed before anything is sent, so overlapping runs cannot repeat side effects. */
    public readonly reservedIds = new Set<string>();
    /** Latest run status per invocation ID. An ID without an entry has not run since the collection was opened. */
    public readonly statuses = new Map<string, InvocationRunStatus>();
}

/**
 * A cached successful run that dependents can bind to and Send can reuse while it stays current.
 */
export interface RunOutput extends HttpInvocationResult {
    /**
     * Serialized template before substitution, compared with the current saved request.
     */
    definition: string;
    /**
     * Prerequisite results this run used, by ID, including ordering-only ones. Rerunning any of them makes this result stale.
     */
    inputs: Map<string, RunOutput>;
}
