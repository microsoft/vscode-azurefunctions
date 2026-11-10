/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export async function runWithDotnetSupportDate(callback: () => Promise<void>): Promise<void> {
    const originalNow = Date.now;
    try {
        // Test scaffolding independently of the frameworks' support deadlines.
        Date.now = () => Date.UTC(2026, 0, 15);
        await callback();
    } finally {
        Date.now = originalNow;
    }
}
