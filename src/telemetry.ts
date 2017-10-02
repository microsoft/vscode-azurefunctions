/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import vscode = require('vscode');
import TelemetryReporter from 'vscode-extension-telemetry';

export let reporter: TelemetryReporter;

export class Reporter extends vscode.Disposable {
    constructor(context: vscode.ExtensionContext) {
        super(() => reporter.dispose());

        const packageInfo: IPackageInfo | undefined = getPackageInfo(context);
        if (packageInfo) {
            reporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
        }
    }
}

interface IPackageInfo {
    name: string;
    version: string;
    aiKey: string;
}

function getPackageInfo(context: vscode.ExtensionContext): IPackageInfo | undefined {
    const extensionPackage: IPackageInfo = require(context.asAbsolutePath('./package.json'));
    if (extensionPackage) {
        return {
            name: extensionPackage.name,
            version: extensionPackage.version,
            aiKey: extensionPackage.aiKey
        };
    }
}
