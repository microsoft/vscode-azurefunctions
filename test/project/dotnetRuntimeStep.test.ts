/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, TestOutputChannel } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { ConfigurationTarget, workspace } from 'vscode';
import { DotnetRuntimeStep } from '../../src/commands/createNewProject/dotnetSteps/DotnetRuntimeStep';
import { type IProjectWizardContext } from '../../src/commands/createNewProject/IProjectWizardContext';
import { hiddenStacksSetting } from '../../src/constants';
import { ext } from '../../src/extensionVariables';
import { FuncVersion } from '../../src/FuncVersion';
import { cliFeedUtils } from '../../src/utils/cliFeedUtils';

suite('DotnetRuntimeStep', () => {
    const now = Date.parse('2026-01-15T00:00:00Z');
    const originalNow = Date.now;
    const originalGetLatestVersion = cliFeedUtils.getLatestVersion;
    const originalGetLatestReleaseVersionForMajorVersion = cliFeedUtils.getLatestReleaseVersionForMajorVersion;
    const originalGetRelease = cliFeedUtils.getRelease;
    let isolatedRuntimes: cliFeedUtils.IWorkerRuntime[];
    let inProcessRuntimes: cliFeedUtils.IWorkerRuntime[];
    let oldHiddenStacks: boolean | undefined;

    setup(async () => {
        const configuration = workspace.getConfiguration(ext.prefix);
        oldHiddenStacks = configuration.inspect<boolean>(hiddenStacksSetting)?.workspaceValue;
        await configuration.update(hiddenStacksSetting, false, ConfigurationTarget.Workspace);
        Date.now = () => now;
        isolatedRuntimes = [];
        inProcessRuntimes = [];
        cliFeedUtils.getLatestVersion = async () => 'isolated';
        cliFeedUtils.getLatestReleaseVersionForMajorVersion = async (_context, majorVersion) => {
            assert.strictEqual(majorVersion, '0');
            return 'in-process';
        };
        cliFeedUtils.getRelease = async (_context, version) => ({
            templates: '',
            workerRuntimes: {
                dotnet: Object.fromEntries((version === 'isolated' ? isolatedRuntimes : inProcessRuntimes).map(r => [r.targetFramework, r]))
            }
        });
    });

    teardown(async () => {
        Date.now = originalNow;
        cliFeedUtils.getLatestVersion = originalGetLatestVersion;
        cliFeedUtils.getLatestReleaseVersionForMajorVersion = originalGetLatestReleaseVersionForMajorVersion;
        cliFeedUtils.getRelease = originalGetRelease;
        await workspace.getConfiguration(ext.prefix).update(hiddenStacksSetting, oldHiddenStacks, ConfigurationTarget.Workspace);
    });

    function runtime(targetFramework: string, endOfLifeDate?: string, hidden: boolean = false): cliFeedUtils.IWorkerRuntime {
        return {
            displayInfo: { displayName: targetFramework, hidden, endOfLifeDate },
            sdk: { name: 'Microsoft.Azure.Functions.Worker.Sdk' },
            targetFramework,
            itemTemplates: '',
            projectTemplates: '',
            projectTemplateId: { csharp: '' },
            capabilities: 'isolated'
        };
    }

    async function createContext(): Promise<IProjectWizardContext> {
        return {
            ...await createTestActionContext(),
            version: FuncVersion.v4,
            projectPath: '',
            workspacePath: '',
            workspaceFolder: undefined,
            projectTemplateKey: undefined
        };
    }

    test('filters expired isolated and in-process runtimes at the UTC cutoff', async () => {
        const supported = runtime('net8.0', '2026-01-15T00:00:00.001Z');
        const withoutDeadline = runtime('net48');
        const supportedInProcess = runtime('net9.0', '2026-01-16T00:00:00Z');
        isolatedRuntimes = [
            runtime('net5.0', '2026-01-14T23:59:59.999Z'),
            runtime('net6.0', '2026-01-15T00:00:00Z'),
            supported,
            withoutDeadline,
            runtime('net10.0', undefined, true)
        ];
        inProcessRuntimes = [
            runtime('net7.0', '2026-01-15T00:00:00Z'),
            supportedInProcess
        ];
        const context = await createContext();
        context.ui.showQuickPick = async picks => {
            const resolvedPicks = await picks;
            assert.deepStrictEqual(resolvedPicks.map(p => p.label), ['net8.0', 'net48', 'net9.0']);
            return resolvedPicks[0];
        };

        await new DotnetRuntimeStep().prompt(context);

        assert.strictEqual(context.workerRuntime, supported);
        assert.strictEqual(context.projectTemplateKey, 'net8.0-isolated');
    });

    test('compares timezone offsets as UTC instants', async () => {
        isolatedRuntimes = [
            runtime('net6.0', '2026-01-14T16:00:00-08:00'),
            runtime('net8.0', '2026-01-15T09:00:00+08:00')
        ];
        const context = await createContext();
        context.targetFramework = 'net8.0';

        await DotnetRuntimeStep.createStep(context);
        assert.strictEqual(context.workerRuntime, isolatedRuntimes[1]);

        context.targetFramework = 'net6.0';
        await assert.rejects(DotnetRuntimeStep.createStep(context), /Unrecognized target frameworks/);
    });

    test('showHiddenStacks does not restore expired runtimes', async () => {
        isolatedRuntimes = [
            runtime('net6.0', '2026-01-15T00:00:00Z', true),
            runtime('net8.0', '2026-01-16T00:00:00Z', true)
        ];
        const context = await createContext();
        context.ui.showQuickPick = async picks => {
            const resolvedPicks = await picks;
            assert.deepStrictEqual(resolvedPicks.map(p => p.label), ['net8.0']);
            return resolvedPicks[0];
        };

        await workspace.getConfiguration(ext.prefix).update(hiddenStacksSetting, true, ConfigurationTarget.Workspace);
        await new DotnetRuntimeStep().prompt(context);
    });

    test('reports an error when all runtimes are expired', async () => {
        isolatedRuntimes = [runtime('net6.0', '2026-01-15T00:00:00Z')];
        inProcessRuntimes = [runtime('net7.0', '2026-01-14T00:00:00Z')];
        const context = await createContext();

        await assert.rejects(new DotnetRuntimeStep().prompt(context), /No .NET worker runtimes found/);
    });

    test('logs malformed support dates and keeps isolated and in-process runtimes available', async () => {
        isolatedRuntimes = [
            runtime('net6.0', '2026-01-15T00:00:00Z'),
            runtime('net8.0', 'invalid-date')
        ];
        inProcessRuntimes = [runtime('net9.0', 'another-invalid-date')];
        const context = await createContext();
        context.ui.showQuickPick = async picks => {
            const resolvedPicks = await picks;
            assert.deepStrictEqual(resolvedPicks.map(p => p.label), ['net8.0', 'net9.0']);
            return resolvedPicks[0];
        };
        const originalOutputChannel = ext.outputChannel;
        const logs: string[] = [];
        const outputChannel = new TestOutputChannel();
        outputChannel.appendLog = message => { logs.push(message); };

        try {
            ext.outputChannel = outputChannel;
            await new DotnetRuntimeStep().prompt(context);
            assert.strictEqual(context.workerRuntime, isolatedRuntimes[1]);
            assert.strictEqual(logs.length, 2);
            assert.match(logs[0], /WARNING: Invalid end-of-support date.*net8\.0/);
            assert.match(logs[1], /WARNING: Invalid end-of-support date.*net9\.0/);
        } finally {
            ext.outputChannel = originalOutputChannel;
            outputChannel.dispose();
        }
    });
});
