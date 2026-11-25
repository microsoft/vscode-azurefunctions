/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared by the extension and the editor webview bundle, so this file must stay browser-safe:
// no Node or vscode imports, and no imports of other src/azureInvoke files outside models/.

import { type HttpHeaderOrQueryParameter } from './httpSchema';

/*
 * Results and messages for a single HTTP run. These are never saved, so they aren't versioned.
 * The saved invocation schema is in httpSchema.ts.
 */

/**
 * The response from one HTTP run.
 */
export interface HttpResponse {
    status: number;
    /** Transport time in milliseconds. */
    duration: number;
    headers: HttpHeaderOrQueryParameter[];
    body: string;
}

/**
 * Run updates sent to the editor, with a sequence so replayed messages cannot replace newer ones.
 */
export type HttpRequestStateMessage = (
    | { command: 'requestStarted'; saved: boolean }
    | { command: 'response'; response: HttpResponse }
    | { command: 'requestError'; message: string; cancelled?: boolean; blocked?: boolean }
) & { sequence?: number };
