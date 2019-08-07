/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import opn = require("opn");

export async function openUrl(url: string): Promise<void> {
    // Using this functionality is blocked by https://github.com/Microsoft/vscode/issues/25852
    // Specifically, opening the Live Metrics Stream for Linux Function Apps doesn't work in this extension.
    // await vscode.env.openExternal(vscode.Uri.parse(url));

    // tslint:disable-next-line: no-unsafe-any
    opn(url);
}
