/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vscode';
import { AzureAccount, AzureLoginStatus, AzureResourceFilter, AzureSession } from '../src/azure-account.api';

export class TestAzureAccount implements AzureAccount {
    public readonly status: AzureLoginStatus;
    public readonly onStatusChanged: Event<AzureLoginStatus>;
    public readonly sessions: AzureSession[] = [];
    public readonly onSessionsChanged: Event<void>;
    public readonly filters: AzureResourceFilter[] = [];
    public readonly onFiltersChanged: Event<void>;
    public async waitForLogin(): Promise<boolean> { return false; }
}
