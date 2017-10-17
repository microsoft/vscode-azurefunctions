/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

// tslint:disable-next-line:export-name
export async function writeToFile(path: string, data: string): Promise<void> {
    await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
        fs.writeFile(path, data, (error?: Error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}
