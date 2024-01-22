/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site } from '@azure/arm-appservice';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { window } from 'vscode';
import { viewOutput } from '../../constants-nls';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';

export interface ISiteCreatedOptions extends IActionContext {
    showCreatedNotification?: boolean;
}

export function showSiteCreated(site: ParsedSite, context: ISiteCreatedOptions): void {
    const message: string = site.isSlot ?
        localize('createdNewSlot', 'Successfully created slot "{0}": {1}', site.slotName, site.defaultHostUrl) :
        localize('createdNewApp', 'Successfully created function app "{0}": {1}', site.fullName, site.defaultHostUrl);

    ext.outputChannel.appendLog(message);

    if (context.showCreatedNotification) {
        // don't wait
        void window.showInformationMessage(message, viewOutput).then(result => {
            if (result === viewOutput) {
                ext.outputChannel.show();
            }
        });
    }
}

export function showSiteCreatedUnParsed(site: Site, context: ISiteCreatedOptions): void {
    const message: string = localize('createdNewApp', 'Successfully created function app "{0}": {1}', site.id, `https://${site.defaultHostName}`);
    ext.outputChannel.appendLog(message);

    if (context.showCreatedNotification) {
        // don't wait
        void window.showInformationMessage(message, viewOutput).then(result => {
            if (result === viewOutput) {
                ext.outputChannel.show();
            }
        });
    }
}
