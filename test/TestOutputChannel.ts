/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// copied from https://github.com/Microsoft/vscode-azuretools/blob/master/dev/src/TestOutputChannel.ts
// due to https://github.com/Microsoft/vscode-azurefunctions/issues/1008

import { OutputChannel } from "vscode";

export class TestOutputChannel implements OutputChannel {
    public name: string = 'Extension Test Output';

    public append(value: string): void {
        // Technically this is wrong (because of the new line), but good enough for now
        console.log(value);
    }

    public appendLine(value: string): void {
        console.log(value);
    }

    public clear(): void {
        // do nothing
    }

    public show(): void {
        // do nothing
    }

    public hide(): void {
        // do nothing
    }

    public dispose(): void {
        // do nothing
    }
}
