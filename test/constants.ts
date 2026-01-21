/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// #region create-new-project
// Project type picks
export const durableOrchestratorPick: RegExp = /Durable Functions Orch/i; // Sometimes this is "orchestrator" or "orchestration" depending on the template feed
export const durableAzureStoragePick: RegExp = /Azure Storage/i;

// Default names
export const durableOrchestratorName: string = 'durableHello';

// Language picks
export const jsLanguagePick: RegExp = /JavaScript/i;

// Framework picks
export const jsModelV4Pick: RegExp = /v4/i;

// #endregion

// ----------------------------

// #region create-function-app
// Default runtime picks
export const nodeRuntimePick: RegExp = /Node\.js(\s)?22/i;

// Location picks
export const locationDefaultPick: RegExp = /West US 2/i;

// #endregion
