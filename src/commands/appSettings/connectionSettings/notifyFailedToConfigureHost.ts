/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { hostFileName } from "../../../constants";
import { viewOutput } from "../../../constants-nls";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";

export function notifyFailedToConfigureHost(context: IActionContext, message: string): void {
    ext.outputChannel.appendLog(message);

    const notification: string = localize('failedToConfigureHost', 'Failed to configure your "{0}".', hostFileName);
    void context.ui.showWarningMessage(notification, { title: viewOutput }).then(result => {
        if (result.title === viewOutput) {
            ext.outputChannel.show();
        }
    });
}
