/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// disabling for unimportant test code
// tslint:disable:no-reserved-keywords
// tslint:disable:no-any
// tslint:disable:typedef
// tslint:disable:strict-boolean-expressions

import * as path from 'path';
import { ExtensionContext, Memento } from 'vscode';

class TestMemento implements Memento {
    private _data: { [key: string]: any } = {};
    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get(key: any, defaultValue?: any) {
        return this._data[key] || defaultValue;
    }
    public async update(key: string, value: any): Promise<void> {
        this._data[key] = value;
    }
}

export class TestExtensionContext implements ExtensionContext {
    public subscriptions: { dispose(): any; }[]; public workspaceState: Memento;
    public globalState: Memento;
    public extensionPath: string;
    public storagePath: string | undefined;
    constructor() {
        this.globalState = new TestMemento();
    }
    public asAbsolutePath(relativePath: string): string {
        return path.join(__dirname, '..', '..', relativePath);
    }
}
