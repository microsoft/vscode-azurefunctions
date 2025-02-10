/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, type CancellationToken } from "vscode";
import { delay } from "./delay";

export async function withCancellation<T = void>(action: (token: CancellationToken) => Promise<T>, timeoutMs: number): Promise<T> {

    const cts = new CancellationTokenSource();

    try {

        const asyncWait = action(cts.token);
        const delayWait = delay(timeoutMs);

        await Promise.race([asyncWait, delayWait]);

        cts.cancel();

        return await asyncWait;
    }
    finally {
        cts.dispose();
    }
}
