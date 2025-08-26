/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Workaround for missing AuthenticationSessionRequest type in @microsoft/vscode-azext-utils
// This appears to be a bug in the Azure extension packages
declare module 'vscode' {
    export type AuthenticationSessionRequest = readonly string[];
}