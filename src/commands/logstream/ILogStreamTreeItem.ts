/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import { IAzureTreeItem } from 'vscode-azureextensionui';

export interface ILogStreamTreeItem extends IAzureTreeItem {
    logStream: vscode.Disposable | undefined;
    logStreamPath: string;
    logStreamLabel: string;
    siteWrapper: SiteWrapper;
}
