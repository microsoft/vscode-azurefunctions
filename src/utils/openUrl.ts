/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import opn = require("opn");

export function openUrl(url: string): void {
    // Using this functionality is blocked by https://github.com/Microsoft/vscode/issues/25852
    // Specifically, opening the Live Metrics Stream for Linux Function Apps doesn't work in this extension.
    // await vscode.env.openExternal(vscode.Uri.parse(url));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    opn(url);
}
