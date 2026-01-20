/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Start section create-new-project
// Project type picks
export const httpTriggerPick: RegExp = /HTTP\s?Trigger/i;
export const durableOrchestratorPick: RegExp = /Durable Functions Orch/i; // Sometimes this is "orchestrator" or "orchestration" depending on the template feed
export const durableAzureStoragePick: RegExp = /Azure Storage/i;

// Default names
export const httpTriggerName: string = 'httpTrigger';
export const durableOrchestratorName: string = 'durableHello';
export const dotnetNamespaceName: string = 'Company.Function';

// Language picks
export const jsLanguagePick: RegExp = /JavaScript/i;
export const pythonLanguagePick: RegExp = /Python/i;
export const cSharpLanguagePick: RegExp = /C#/i;

// Framework picks
export const jsModelV4Pick: RegExp = /v4/i;
export const pythonModelV2Pick: RegExp = /v2/i;
export const dotnetIsolatedPick: RegExp = /\.NET 10/i;

// Start section create-function-app
export const locationDefaultPick: RegExp = /West US 2/i;

// Default runtime picks
export const pythonRuntimePick: RegExp = /Python(\s)?3\.12/i;
export const nodeRuntimePick: RegExp = /Node\.js(\s)?22/i;
export const dotnetIsolatedRuntimePick: RegExp = /\.NET(\s)?10(\s)?Isolated/i;
