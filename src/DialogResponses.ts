/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem } from 'vscode';
import { localize } from './localize';

export namespace DialogResponses {
    export const neverAskWithNo: MessageItem = { title: localize('azFunc.NeverAskWithNo', 'No and never ask again'), isCloseAffordance: true };
    export const skipForNow: MessageItem = { title: localize('azFunc.SkipForNow', 'Skip for now') };
    export const yes: MessageItem = { title: localize('azFunc.Yes', 'Yes') };
    export const no: MessageItem = { title: localize('azFunc.No', 'No') };
    export const cancel: MessageItem = { title: localize('azFunc.Cancel', 'Cancel'), isCloseAffordance: true };
}
