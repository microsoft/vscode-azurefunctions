/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as semver from 'semver';
import { getFuncCliPath } from '../../funcCoreTools/getFuncCliPath';
import { localize } from '../../localize';
import { cpUtils } from '../../utils/cpUtils';
import { ConnectorTriggerF5SetupError } from './connectorTriggerF5Contracts';

export async function validateConnectorVscodeRuntime(context: IActionContext, projectPath: string): Promise<void> {
    context.valuesToMask.push(projectPath);
    try {
        const executable = await getFuncCliPath(context, projectPath);
        let result = await cpUtils.tryExecuteCommand(undefined, projectPath, executable, ['bundles', 'path', '--script-root', projectPath]);
        let candidates = result.cmdOutput.split(/\r?\n/).map(line => line.trim()).filter(line => path.isAbsolute(line));
        if (result.code !== 0 || candidates.length === 0) {
            context.telemetry.properties.connectorVscodeBundleDownload = 'started';
            const download = await cpUtils.tryExecuteCommand(undefined, projectPath, executable, ['bundles', 'download', '--script-root', projectPath]);
            if (download.code !== 0) {
                context.telemetry.properties.connectorVscodeBundleDownload = 'failed';
                throw unsupportedRuntime();
            }
            context.telemetry.properties.connectorVscodeBundleDownload = 'succeeded';
            result = await cpUtils.tryExecuteCommand(undefined, projectPath, executable, ['bundles', 'path', '--script-root', projectPath]);
            candidates = result.cmdOutput.split(/\r?\n/).map(line => line.trim()).filter(line => path.isAbsolute(line));
        }
        if (result.code !== 0 || candidates.length !== 1) {
            throw unsupportedRuntime();
        }
        const bin = path.join(candidates[0], 'bin');
        context.valuesToMask.push(candidates[0], bin);
        const dependencies: unknown = await AzExtFsExtra.readJSON(path.join(bin, 'function.deps.json'));
        const native = getBrokerNativeAsset(process.platform, process.arch);
        if (!hasConnectorVscodeDependencies(dependencies) || !native) {
            throw unsupportedRuntime();
        }
        for (const asset of [
            'Microsoft.Azure.Functions.Extensions.Connector.dll',
            'Azure.Identity.dll',
            'Azure.Identity.Broker.dll',
            'Microsoft.Identity.Client.Broker.dll',
            'Microsoft.Identity.Client.NativeInterop.dll',
            native,
        ]) {
            if (!await AzExtFsExtra.pathExists(path.join(bin, asset))) {
                throw unsupportedRuntime();
            }
        }
        context.telemetry.properties.connectorVscodeRuntimeSupported = 'true';
    } catch (error) {
        context.telemetry.properties.connectorVscodeRuntimeSupported = 'false';
        if (error instanceof ConnectorTriggerF5SetupError) {
            throw error;
        }
        throw unsupportedRuntime(error);
    }
}

export function hasConnectorVscodeDependencies(value: unknown): boolean {
    if (!isRecord(value) || !isRecord(value.libraries)) {
        return false;
    }
    const libraries = Object.entries(value.libraries).filter(([, library]) => isRecord(library)).map(([name]) => name);
    const connectorPrefix = 'Microsoft.Azure.Functions.Extensions.Connector/';
    const connector = libraries.find(library => library.startsWith(connectorPrefix))?.slice(connectorPrefix.length);
    const identity = libraries.find(library => library.startsWith('Azure.Identity/'))?.slice('Azure.Identity/'.length);
    return !!connector && !!semver.valid(connector) && semver.gte(connector, '1.0.0') &&
        !!identity && !!semver.valid(identity) && semver.gte(identity, '1.17.0') &&
        ['Azure.Identity.Broker/', 'Microsoft.Identity.Client.Broker/', 'Microsoft.Identity.Client.NativeInterop/']
            .every(prefix => libraries.some(library => library.startsWith(prefix)));
}

export function getBrokerNativeAsset(platform: NodeJS.Platform, architecture: string): string | undefined {
    const name = platform === 'win32' ?
        architecture === 'arm64' ? 'msalruntime_arm64.dll' : architecture === 'ia32' ? 'msalruntime_x86.dll' : architecture === 'x64' ? 'msalruntime.dll' : undefined :
        platform === 'darwin' ?
            architecture === 'arm64' ? 'msalruntime_arm64.dylib' : architecture === 'x64' ? 'msalruntime.dylib' : undefined :
            platform === 'linux' && architecture === 'x64' ? 'libmsalruntime.so' : undefined;
    const os = platform === 'win32' ? 'win' : platform === 'darwin' ? 'osx' : platform;
    const arch = architecture === 'ia32' ? 'x86' : architecture;
    return name ? path.join('runtimes', `${os}-${arch}`, 'native', name) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function unsupportedRuntime(cause?: unknown): ConnectorTriggerF5SetupError {
    return new ConnectorTriggerF5SetupError(cause, localize(
        'connectorVscodeRuntimeUnsupported',
        'The selected local Functions host does not provide verified Connector Poll and VS Code broker support. Use preview extension bundle 4.50.0 or later with Microsoft.Azure.Functions.Extensions.Connector 1.0.0 or later, Azure Identity 1.17 or later, Azure.Identity.Broker, and its native runtime assets. Set the host.json extensionBundle version range to [4.50.0,5.0.0), run "func bundles download", then retry F5. No Azure resources or credential settings were changed.',
    ));
}
