/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Sometimes this is "orchestrator" or "orchestration" depending on the template feed
export const durableOrchestratorPick: RegExp = /Durable Functions Orch/i;
export const durableOrchestratorName: string = 'durableHello';

export const locationDefaultPick: RegExp = /West US 2/i;
export const pythonDefaultPick: RegExp = /Python(\s)?3\.12/i;
export const nodeDefaultPick: RegExp = /Node\.js(\s)?22/i;
export const dotnetIsolatedDefaultPick: RegExp = /\.NET(\s)?10(\s)?Isolated/i;
