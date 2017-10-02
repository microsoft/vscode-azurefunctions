/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import vscodeExtensionTelemetry from 'vscode-extension-telemetry';

export let reporter: vscodeExtensionTelemetry;

export class Reporter extends vscode.Disposable {
    constructor(context: vscode.ExtensionContext) {
        super(() => reporter.dispose());

        const packageInfo: IPackageInfo | undefined = getPackageInfo(context);
        if (packageInfo) {
            reporter = packageInfo && new vscodeExtensionTelemetry(packageInfo.name, packageInfo.version, packageInfo.aiKey);
        }
    }
}

interface IPackageInfo {
    name: string;
    version: string;
    aiKey: string;
}

function getPackageInfo(context: vscode.ExtensionContext): IPackageInfo | undefined {
    // tslint:disable-next-line:non-literal-require no-require-imports
    const extensionPackage: IPackageInfo = require(context.asAbsolutePath('./package.json'));
    if (extensionPackage) {
        return {
            name: extensionPackage.name,
            version: extensionPackage.version,
            aiKey: extensionPackage.aiKey
        };
    }
}
