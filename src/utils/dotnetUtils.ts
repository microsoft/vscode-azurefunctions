/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "../localize";
import { cpUtils } from "./cpUtils";

export namespace dotnetUtils {
    export async function validateDotnetInstalled(): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, undefined, 'dotnet', '--version');
        } catch (error) {
            throw new Error(localize('dotnetNotInstalled', 'You must have the .NET CLI installed to perform this operation.'));
        }
    }
}
