/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type EventGridSource } from "./eventGridSources";


export interface EventGridExecuteFunctionContext extends IActionContext {
    eventSource?: EventGridSource;
    selectedFileName?: string;
    selectedFileUrl?: string;
    fileOpened?: boolean;
}

