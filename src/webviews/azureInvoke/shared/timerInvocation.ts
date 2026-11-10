/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isInvocationName } from './httpRequest';

export interface TimerInvocationRequest {
    hostUrl: string;
    functionName: string;
    schedule: string;
}

export interface TimerInvocation {
    readonly id: string;
    readonly name: string;
    readonly group?: string;
    readonly trigger: 'timer';
    readonly request: TimerInvocationRequest;
}

export function isTimerInvocation(value: unknown): value is TimerInvocation {
    return !!value && typeof value === 'object' && 'trigger' in value && value.trigger === 'timer' &&
        'id' in value && typeof value.id === 'string' && !!value.id && value.id.length <= 100 &&
        'name' in value && isInvocationName(value.name) &&
        (!('group' in value) || value.group === undefined || isInvocationName(value.group)) &&
        'request' in value && !!value.request && typeof value.request === 'object' &&
        'hostUrl' in value.request && typeof value.request.hostUrl === 'string' &&
        'functionName' in value.request && typeof value.request.functionName === 'string' &&
        'schedule' in value.request && typeof value.request.schedule === 'string';
}

export function isValidTimerRequest(request: TimerInvocationRequest): boolean {
    if (!/^[a-z][a-z0-9_-]{0,127}$/i.test(request.functionName) ||
        request.schedule.length > 256 || /[\r\n]/.test(request.schedule) || request.hostUrl.length > 2000) {
        return false;
    }
    try {
        const url = new URL(request.hostUrl);
        return (url.protocol === 'http:' || url.protocol === 'https:') &&
            (url.hostname === 'localhost' || url.hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(url.hostname)) &&
            url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
    } catch {
        return false;
    }
}

export function copyTimerInvocation(invocation: TimerInvocation): TimerInvocation {
    return {
        id: invocation.id, name: invocation.name.trim(), trigger: 'timer',
        ...(invocation.group === undefined ? {} : { group: invocation.group.trim() }),
        request: copyTimerRequest(invocation.request),
    };
}

export function copyTimerRequest(request: TimerInvocationRequest): TimerInvocationRequest {
    return { hostUrl: request.hostUrl, functionName: request.functionName, schedule: request.schedule };
}

export interface TimerInvocationResult {
    status: number;
    duration: number;
    functionExecution: 'notObserved';
}

export type TimerInvocationState =
    | { command: 'invocationStarted' }
    | { command: 'invocationResult'; result: TimerInvocationResult }
    | { command: 'invocationError'; message: string; cancelled: boolean };

export interface TimerViewConfiguration {
    invocation: TimerInvocation;
    saved: boolean;
    labels: Record<string, string>;
}

export type TimerViewMessage = TimerInvocationState
    | { command: 'saved' }
    | { command: 'focusBreakpointGuidance' }
    | { command: 'notice'; message: string }
    | { command: 'error'; message: string };
