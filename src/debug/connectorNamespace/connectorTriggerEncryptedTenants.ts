/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { stripVTControlCharacters } from 'util';
import { getFuncCliPath } from '../../funcCoreTools/getFuncCliPath';
import { localize } from '../../localize';
import { cpUtils } from '../../utils/cpUtils';
import { getLoginShellEnvWithInheritedPath } from '../../utils/loginShellPath';

type SettingsReader = (context: IActionContext, projectPath: string, directory: string, environment: NodeJS.ProcessEnv) => Promise<string>;

/**
 * Core Tools can list decrypted values without rewriting the settings file. Give it only the encrypted
 * tenant values, under synthetic names, so neither the project file nor unrelated settings are exposed.
 */
export async function readEncryptedConnectorTenants(
    context: IActionContext,
    projectPath: string,
    encryptedValues: readonly string[],
    environment: NodeJS.ProcessEnv,
    readSettings: SettingsReader = readWithCoreTools,
): Promise<string[]> {
    let directory: string | undefined;
    let result: string[] | undefined;
    let cleanupFailed = false;
    try {
        directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'func-tenant-'));
        const values = Object.fromEntries(encryptedValues.map((value, index) => [`Tenant${index}`, value]));
        await fs.promises.writeFile(
            path.join(directory, 'local.settings.json'),
            JSON.stringify({ IsEncrypted: true, Values: values }),
            { mode: 0o600, flag: 'wx' },
        );
        const output = await readSettings(context, projectPath, directory, environment);
        const lines = stripVTControlCharacters(output).split(/\r?\n/);
        result = encryptedValues.map((_, index) => {
            const name = `   -> Name: Tenant${index}`;
            const matches = lines.flatMap((line, lineIndex) => line === name ? [lineIndex] : []);
            if (matches.length !== 1) {
                throw new Error('Invalid settings output');
            }
            const match = /^ {6}Value: ([\w.-]*)$/.exec(lines[matches[0] + 1] ?? '');
            if (!match) {
                throw new Error('Invalid settings output');
            }
            return match[1];
        });
    } catch {
        // The Core Tools output and underlying error can contain settings values.
    } finally {
        if (directory) {
            try {
                await fs.promises.rm(directory, { recursive: true, force: true });
            } catch {
                cleanupFailed = true;
            }
        }
    }
    if (cleanupFailed) {
        throw new Error(localize(
            'connectorEncryptedTenantCleanupFailed',
            'VS Code could not remove temporary encrypted Connector Trigger settings. Check your temporary files, then retry debugging.',
        ));
    }
    if (!result) {
        throw new Error(localize(
            'connectorEncryptedTenantReadFailed',
            'VS Code could not read the encrypted Connector Trigger tenant for authentication. Verify that Core Tools can decrypt local.settings.json, then retry debugging.',
        ));
    }
    return result;
}

export interface CoreToolsSettingsDependencies {
    getCliPath(context: IActionContext, projectPath: string): Promise<string>;
    getEnvironment(command: string, environment: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv | undefined>;
    execute(directory: string, command: string, args: string[], environment: NodeJS.ProcessEnv): Promise<{ code: number; cmdOutput: string }>;
}

const coreToolsSettingsDependencies: CoreToolsSettingsDependencies = {
    getCliPath: getFuncCliPath,
    getEnvironment: getLoginShellEnvWithInheritedPath,
    execute: async (directory, command, args, environment) => await cpUtils.tryExecuteCommand(undefined, directory, command, args, environment),
};

/**
 * Runs `func settings list` in `directory`, which holds only the copied tenant values. The Core Tools path and PATH
 * recovery must still behave as they do in the project, where the host task runs.
 */
export async function readWithCoreTools(
    context: IActionContext,
    projectPath: string,
    directory: string,
    environment: NodeJS.ProcessEnv,
    dependencies: CoreToolsSettingsDependencies = coreToolsSettingsDependencies,
): Promise<string> {
    let cli = await dependencies.getCliPath(context, projectPath);
    // A path such as `node_modules/.bin/func` is relative to the project; a bare command is found on PATH.
    if (!path.isAbsolute(cli) && /[\\/]/.test(cli)) {
        cli = path.resolve(projectPath, cli);
    }
    const commandEnvironment = await dependencies.getEnvironment(cli, environment) ?? environment;
    const result = await dependencies.execute(directory, cli, ['settings', 'list', '--showValue'], commandEnvironment);
    if (result.code !== 0) {
        throw new Error('Core Tools settings list failed');
    }
    return result.cmdOutput;
}
