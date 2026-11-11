/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { hostStartTaskName } from '../src/constants';
import { ProjectConnectorTriggerBindingResolver } from '../src/debug/connectorNamespace/ConnectorTriggerF5BindingResolver';
import { type ConnectorTriggerF5Dependencies } from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { validateConnectorNamespacePreDebug } from '../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';
import { getEffectiveTaskEnvironment, resolveDebugHostTarget, resolveTaskVariables } from '../src/debug/resolveDebugHostTarget';

suite('resolveDebugHostTarget', () => {
    let root: string;
    let workspace: vscode.WorkspaceFolder;

    suiteSetup(async () => {
        const tempPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'debugHostTarget'));
        workspace = { uri: vscode.Uri.file(tempPath), name: path.basename(tempPath), index: 0 };
        root = workspace.uri.fsPath;
        for (const project of ['ProjectA', 'ProjectB', path.join('ProjectB', 'bin', 'Debug', 'net8.0')]) {
            await fs.promises.mkdir(path.join(root, project), { recursive: true });
            await fs.promises.writeFile(path.join(root, project, 'host.json'), '{}');
        }
    });

    suiteTeardown(async () => {
        await fs.promises.rm(root, { recursive: true, force: true });
    });

    function createHostTask(cwd: string | undefined, env?: Record<string, string>, name: string = hostStartTaskName): vscode.Task {
        return new vscode.Task({ type: 'func', command: 'host start' }, workspace, name, 'func',
            new vscode.ShellExecution('func host start', { cwd, env }));
    }

    test('resolves the pre-launch task project instead of a sibling project', async () => {
        const context = await createTestActionContext();
        const target = await resolveDebugHostTarget(context, workspace, { type: 'node', request: 'attach', name: 'Attach', preLaunchTask: hostStartTaskName },
            async () => [
                createHostTask('${workspaceFolder}/ProjectA', undefined, 'other task'),
                createHostTask('${workspaceFolder}/ProjectB'),
            ]);
        assert.strictEqual(target.source, 'task');
        assert.strictEqual(target.hostTaskTargetsProject, true);
        assert.strictEqual(target.projectPath, path.join(root, 'ProjectB'));
    });

    test('maps a build-output task cwd back to its source project', async () => {
        const context = await createTestActionContext();
        const target = await resolveDebugHostTarget(context, workspace, { type: 'coreclr', request: 'attach', name: 'Attach', preLaunchTask: hostStartTaskName },
            async () => [createHostTask('ProjectB/bin/Debug/net8.0')]);
        assert.strictEqual(target.projectPath, path.join(root, 'ProjectB'));
        assert.strictEqual(target.hostTaskTargetsProject, true);
    });

    test('does not treat a task outside any project as the default project', async () => {
        const context = await createTestActionContext();
        const target = await resolveDebugHostTarget(context, workspace, { type: 'node', request: 'attach', name: 'Attach', preLaunchTask: hostStartTaskName },
            async () => [createHostTask('${workspaceFolder}/scripts')]);
        assert.strictEqual(target.source, 'taskOutsideProject');
        assert.strictEqual(target.hostTaskTargetsProject, false);
    });

    test('treats a cwd with interactive variables as unresolved', async () => {
        const context = await createTestActionContext();
        const target = await resolveDebugHostTarget(context, workspace, { type: 'node', request: 'attach', name: 'Attach', preLaunchTask: hostStartTaskName },
            async () => [createHostTask('${input:projectFolder}')]);
        assert.strictEqual(target.source, 'taskUnresolvedCwd');
        assert.strictEqual(target.hostTaskTargetsProject, false);
    });

    test('falls back to the workspace default only when the task is not found', async () => {
        const context = await createTestActionContext();
        const singleProject: vscode.WorkspaceFolder = { uri: vscode.Uri.file(path.join(root, 'ProjectA')), name: 'ProjectA', index: 0 };
        const target = await resolveDebugHostTarget(context, singleProject, { type: 'node', request: 'attach', name: 'Attach', preLaunchTask: hostStartTaskName },
            async () => [createHostTask('${workspaceFolder}/ProjectB', undefined, 'unrelated task')]);
        assert.strictEqual(target.source, 'workspaceDefault');
        assert.strictEqual(target.projectPath, singleProject.uri.fsPath);
        assert.strictEqual(target.environment, undefined);
    });

    test('resolves task variables and merges task env over the inherited environment', () => {
        assert.strictEqual(resolveTaskVariables('${workspaceFolder}${/}ProjectA', workspace), path.join(root, 'ProjectA'));
        assert.strictEqual(resolveTaskVariables('${command:pick}', workspace), undefined);

        const inheritedName = process.platform === 'win32' ? 'connector_endpoint' : 'CONNECTOR_ENDPOINT';
        const environment = getEffectiveTaskEnvironment(
            { CONNECTOR_ENDPOINT: 'task-value', PROJECT: '${workspaceFolderBasename}' },
            workspace,
            { [inheritedName]: 'inherited-value', OTHER: 'other' },
        );
        assert.strictEqual(environment.CONNECTOR_ENDPOINT, 'task-value');
        assert.strictEqual(environment.PROJECT, workspace.name);
        assert.strictEqual(environment.OTHER, 'other');
        if (process.platform === 'win32') {
            assert.strictEqual(environment[inheritedName], undefined);
        }
    });

    test('settings supplied by the selected task env satisfy pre-debug validation without setup', async () => {
        const projectPath = path.join(root, 'ProjectA');
        await fs.promises.writeFile(path.join(projectPath, 'function_app.py'), `
@app.function_name(name="OnNewEmail")
@app.connector_trigger(connection="ConnectorNamespace", trigger_config_name="%OnNewEmailTriggerConfigName%", delivery_mode=DeliveryMode.POLL)
def on_new_email(event):
    pass
`);
        await fs.promises.writeFile(path.join(projectPath, 'local.settings.json'), JSON.stringify({ IsEncrypted: false, Values: {} }));
        try {
            const context = await createTestActionContext();
            const target = await resolveDebugHostTarget(context, workspace, { type: 'debugpy', request: 'attach', name: 'Attach', preLaunchTask: hostStartTaskName },
                async () => [createHostTask('${workspaceFolder}/ProjectA', {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    ConnectorNamespace__pollingEndpoint: 'https://example.invalid/',
                    OnNewEmailTriggerConfigName: '@Microsoft.ConnectorTriggerConfig(sample)',
                })]);
            assert.strictEqual(target.projectPath, projectPath);

            const dependencies = { bindingResolver: new ProjectConnectorTriggerBindingResolver() } as unknown as ConnectorTriggerF5Dependencies;
            await validateConnectorNamespacePreDebug(context, projectPath, dependencies, { environment: target.environment });
            assert.strictEqual(context.telemetry.properties.connectorPollTriggerDetected, 'true');
            assert.strictEqual(context.telemetry.properties.connectorF5SetupResult, 'alreadyConfigured');

            // Control: the same project prompts for setup when only the extension host environment is considered.
            const withoutTaskEnv = await createTestActionContext();
            await assert.rejects(validateConnectorNamespacePreDebug(withoutTaskEnv, projectPath, dependencies, { environment: {} }));
            assert.strictEqual(withoutTaskEnv.telemetry.properties.connectorNamespaceSettingsValid, 'false');
        } finally {
            await fs.promises.rm(path.join(projectPath, 'function_app.py'), { force: true });
            await fs.promises.rm(path.join(projectPath, 'local.settings.json'), { force: true });
        }
    });
});
