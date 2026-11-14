/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs-extra';
import { createRequire } from 'module';
import * as path from 'path';
import * as semver from 'semver';
import { localize } from '../../../localize';

export async function verifyNodeV4McpDependency(projectPath: string, triggerType: string | undefined): Promise<void> {
    // https://github.com/Azure/azure-functions-nodejs-library/releases/tag/v4.12.0
    // https://github.com/Azure/azure-functions-nodejs-library/releases/tag/v4.14.0
    const minimumVersion = triggerType === 'mcpResourceTrigger' ? '4.12.0' : triggerType === 'mcpPromptTrigger' ? '4.14.0' : undefined;
    if (!minimumVersion) {
        return;
    }

    let packagePath: string | undefined;
    try {
        packagePath = createRequire(path.join(projectPath, 'package.json')).resolve('@azure/functions/package.json');
    } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'MODULE_NOT_FOUND')) {
            throw error;
        }
    }

    if (packagePath) {
        const sdkPackage = await fs.readJSON(packagePath) as { version?: unknown };
        if (typeof sdkPackage.version === 'string' && semver.valid(sdkPackage.version) && semver.gte(sdkPackage.version, minimumVersion)) {
            return;
        }
    }

    throw new Error(localize('nodeMcpSdkRequired', 'This MCP template requires @azure/functions {0} or later installed in your project. Run "npm install @azure/functions@^{0}" in the project folder, then try creating the function again.', minimumVersion));
}
