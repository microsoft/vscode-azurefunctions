/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import type * as cp from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';
import { type ConnectorTriggerF5Dependencies, type ConnectorTriggerLocalBinding } from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { validateConnectorNamespacePreDebug } from '../src/debug/connectorNamespace/validateConnectorNamespacePreDebug';
import {
    ConnectorHostLaunchBroker,
    type ConnectorHostLaunchHandler,
    type ConnectorHostLaunchSignal,
} from '../src/debug/connectorNamespace/hostLauncher/ConnectorHostLaunchBroker';
import {
    connectorHostLaunchChannelVariable,
    connectorHostLaunchKeyVariable,
    connectorHostLaunchProtocolVersion,
    createConnectorHostLaunchSecret,
    createObservationProof,
    decodeConnectorHostLaunchKey,
    electronRunAsNodeVariable,
    readConnectorHostLaunchMessages,
    verifyBrokerProof,
    writeConnectorHostLaunchMessage,
    type ConnectorHostLaunchObservation,
} from '../src/debug/connectorNamespace/hostLauncher/connectorHostLaunchProtocol';
import {
    createWindowsBatchCommandLine,
    resolveExecutable,
    runConnectorHostLauncher,
    type ConnectorHostLauncherOptions,
} from '../src/debug/connectorNamespace/hostLauncher/connectorHostLauncher';

const syntheticSecret = 'synthetic-client-secret-value';

interface SpawnRecord {
    command: string;
    args: readonly string[];
    options: cp.SpawnOptions;
}

function createFakeSpawn(records: SpawnRecord[], exitCode = 0): NonNullable<ConnectorHostLauncherOptions['spawn']> {
    return (command, args, options) => {
        records.push({ command, args, options });
        const child = new EventEmitter() as cp.ChildProcess;
        setImmediate(() => child.emit('exit', exitCode));
        return child;
    };
}

function getUnusedChannel(): { channel: string; dispose(): void } {
    if (process.platform === 'win32') {
        return { channel: `\\\\.\\pipe\\connector-launch-test-${createConnectorHostLaunchSecret()}`, dispose: () => { /* Pipe is removed on close. */ } };
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clt-'));
    return { channel: path.join(directory, 's.sock'), dispose: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

suite('Connector host launcher', () => {
    let broker: ConnectorHostLaunchBroker;
    let cwd: string;
    let funcPath: string;
    const disposables: (() => void)[] = [];

    setup(async () => {
        broker = new ConnectorHostLaunchBroker({ handshakeTimeoutMs: 2000 });
        await broker.ensureListening();
        cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-launch-'));
        funcPath = path.join(cwd, process.platform === 'win32' ? 'func.exe' : 'func');
    });

    teardown(async () => {
        broker.dispose();
        for (const dispose of disposables.splice(0)) {
            dispose();
        }
        await fs.promises.rm(cwd, { recursive: true, force: true });
    });

    function launchOptions(overrides: Partial<ConnectorHostLauncherOptions> = {}, records: SpawnRecord[] = []): ConnectorHostLauncherOptions & { errors: string[] } {
        const errors: string[] = [];
        return {
            args: [funcPath, 'host', 'start'],
            environment: {
                ...broker.getLaunchEnvironment(),
                [electronRunAsNodeVariable]: '1',
                PATH: '',
                SYNTHETIC_PROFILE_VALUE: 'from-shell-profile',
                AZURE_CLIENT_SECRET: syntheticSecret,
            },
            cwd,
            writeError: message => errors.push(message),
            spawn: createFakeSpawn(records),
            isExecutable: filePath => filePath === funcPath,
            errors,
            ...overrides,
        };
    }

    test('reports the exact task environment and starts Core Tools with that environment and working directory after setup approves', async () => {
        let observed: ConnectorHostLaunchObservation | undefined;
        broker.register(cwd, async observation => {
            observed = observation;
            return true;
        });
        const records: SpawnRecord[] = [];
        const options = launchOptions({}, records);

        assert.strictEqual(await runConnectorHostLauncher(options), 0);

        assert.ok(observed);
        assert.strictEqual(observed.cwd, cwd);
        assert.strictEqual(observed.environment.SYNTHETIC_PROFILE_VALUE, 'from-shell-profile');
        for (const name of [connectorHostLaunchChannelVariable, connectorHostLaunchKeyVariable, electronRunAsNodeVariable]) {
            assert.strictEqual(observed.environment[name], undefined, name);
        }
        assert.strictEqual(records.length, 1);
        assert.strictEqual(records[0].command, funcPath);
        assert.deepStrictEqual(records[0].args, ['host', 'start']);
        assert.strictEqual(records[0].options.cwd, cwd);
        assert.deepStrictEqual(records[0].options.env, observed.environment);
        assert.deepStrictEqual(options.errors, []);
        assert.strictEqual(broker.hasActiveSetup, false);
    });

    test('starts Core Tools without setup when nothing is pending for the project', async () => {
        const records: SpawnRecord[] = [];
        assert.strictEqual(await runConnectorHostLauncher(launchOptions({}, records)), 0);
        assert.strictEqual(records.length, 1);
    });

    test('matches the deepest registered project and leaves other projects pending', async () => {
        const nested = path.join(cwd, 'nested');
        const calls: string[] = [];
        broker.register(cwd, async () => { calls.push('parent'); return true; });
        broker.register(nested, async () => { calls.push('nested'); return true; });

        assert.strictEqual(await runConnectorHostLauncher(launchOptions({ cwd: nested })), 0);

        assert.deepStrictEqual(calls, ['nested']);
        assert.strictEqual(broker.hasActiveSetup, true);
    });

    test('starts directly without a launch channel, as an unwrapped task would', async () => {
        const records: SpawnRecord[] = [];
        const options = launchOptions({
            environment: { PATH: '' },
            connect: () => { throw new Error('must not connect'); },
        }, records);

        assert.strictEqual(await runConnectorHostLauncher(options), 0);
        assert.strictEqual(records.length, 1);
    });

    for (const [name, environment] of [
        ['only a channel', (env: Record<string, string>) => ({ [connectorHostLaunchChannelVariable]: env[connectorHostLaunchChannelVariable] })],
        ['only a key', (env: Record<string, string>) => ({ [connectorHostLaunchKeyVariable]: env[connectorHostLaunchKeyVariable] })],
        ['a malformed key', (env: Record<string, string>) => ({ ...env, [connectorHostLaunchKeyVariable]: 'not-a-key' })],
    ] as const) {
        test(`does not start Core Tools with ${name}`, async () => {
            let handled = false;
            broker.register(cwd, async () => { handled = true; return true; });
            const records: SpawnRecord[] = [];
            const options = launchOptions({ environment: environment(broker.getLaunchEnvironment()) }, records);

            assert.strictEqual(await runConnectorHostLauncher(options), 1);
            assert.deepStrictEqual(records, []);
            assert.strictEqual(handled, false);
        });
    }

    test('does not start Core Tools when a different key is presented to the broker', async () => {
        let handled = false;
        broker.register(cwd, async () => { handled = true; return true; });
        const records: SpawnRecord[] = [];
        const options = launchOptions({
            environment: { ...broker.getLaunchEnvironment(), [connectorHostLaunchKeyVariable]: createConnectorHostLaunchSecret() },
        }, records);

        assert.strictEqual(await runConnectorHostLauncher(options), 1);
        assert.deepStrictEqual(records, []);
        assert.strictEqual(handled, false);
    });

    test('never sends the environment to a listener that cannot prove it holds the activation key', async () => {
        const { channel, dispose } = getUnusedChannel();
        disposables.push(dispose);
        const received: string[] = [];
        const squatter = net.createServer(socket => {
            socket.setEncoding('utf8');
            socket.on('data', (chunk: string) => {
                received.push(chunk);
                writeConnectorHostLaunchMessage(socket, { type: 'challenge', serverNonce: createConnectorHostLaunchSecret(), proof: 'forged' });
            });
            socket.on('error', () => { /* Ignored. */ });
        });
        await new Promise<void>(resolve => squatter.listen(channel, resolve));
        disposables.push(() => squatter.close());
        const records: SpawnRecord[] = [];
        const options = launchOptions({
            environment: { [connectorHostLaunchChannelVariable]: channel, [connectorHostLaunchKeyVariable]: createConnectorHostLaunchSecret(), AZURE_CLIENT_SECRET: syntheticSecret },
        }, records);

        assert.strictEqual(await runConnectorHostLauncher(options), 1);
        assert.deepStrictEqual(records, []);
        const transcript = received.join('');
        assert.ok(transcript.includes('"hello"'));
        assert.ok(!transcript.includes('observation'));
        assert.ok(!transcript.includes(syntheticSecret));
        assert.ok(!options.errors.join('\n').includes(syntheticSecret));
    });

    test('rejects a replayed client nonce before running setup', async () => {
        let handled = 0;
        broker.register(cwd, async () => { handled += 1; return true; });
        const environment = broker.getLaunchEnvironment();
        const key = decodeConnectorHostLaunchKey(environment[connectorHostLaunchKeyVariable]) as Buffer;
        const clientNonce = createConnectorHostLaunchSecret();

        const exchange = async (): Promise<string[]> => await new Promise(resolve => {
            const types: string[] = [];
            const socket = net.connect(environment[connectorHostLaunchChannelVariable]);
            socket.on('error', () => { /* Closed by the broker. */ });
            socket.on('close', () => resolve(types));
            socket.once('connect', () => writeConnectorHostLaunchMessage(socket, { type: 'hello', version: connectorHostLaunchProtocolVersion, clientNonce }));
            readConnectorHostLaunchMessages(socket, message => {
                types.push(String(message.type));
                if (message.type === 'challenge' && verifyBrokerProof(key, message.proof, clientNonce, String(message.serverNonce))) {
                    const payload = JSON.stringify({ cwd, environment: {} });
                    writeConnectorHostLaunchMessage(socket, {
                        type: 'observation',
                        payload,
                        proof: createObservationProof(key, clientNonce, String(message.serverNonce), payload),
                    });
                }
            }, () => socket.destroy());
        });

        assert.deepStrictEqual(await exchange(), ['challenge', 'decision']);
        broker.register(cwd, async () => { handled += 1; return true; });
        assert.deepStrictEqual(await exchange(), []);
        assert.strictEqual(handled, 1);
        assert.strictEqual(broker.hasActiveSetup, true);
    });

    test('rejects an observation whose proof does not match its payload', async () => {
        let handled = false;
        broker.register(cwd, async () => { handled = true; return true; });
        const environment = broker.getLaunchEnvironment();
        const key = decodeConnectorHostLaunchKey(environment[connectorHostLaunchKeyVariable]) as Buffer;
        const clientNonce = createConnectorHostLaunchSecret();

        const types = await new Promise<string[]>(resolve => {
            const received: string[] = [];
            const socket = net.connect(environment[connectorHostLaunchChannelVariable]);
            socket.on('error', () => { /* Closed by the broker. */ });
            socket.on('close', () => resolve(received));
            socket.once('connect', () => writeConnectorHostLaunchMessage(socket, { type: 'hello', version: connectorHostLaunchProtocolVersion, clientNonce }));
            readConnectorHostLaunchMessages(socket, message => {
                received.push(String(message.type));
                if (message.type === 'challenge') {
                    const signed = JSON.stringify({ cwd, environment: {} });
                    writeConnectorHostLaunchMessage(socket, {
                        type: 'observation',
                        payload: JSON.stringify({ cwd, environment: { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' } }),
                        proof: createObservationProof(key, clientNonce, String(message.serverNonce), signed),
                    });
                }
            }, () => socket.destroy());
        });

        assert.deepStrictEqual(types, ['challenge']);
        assert.strictEqual(handled, false);
    });

    test('times out when the channel never answers', async () => {
        const { channel, dispose } = getUnusedChannel();
        disposables.push(dispose);
        const silent = net.createServer(socket => socket.on('error', () => { /* Ignored. */ }));
        await new Promise<void>(resolve => silent.listen(channel, resolve));
        disposables.push(() => silent.close());
        const records: SpawnRecord[] = [];
        const options = launchOptions({
            environment: { [connectorHostLaunchChannelVariable]: channel, [connectorHostLaunchKeyVariable]: createConnectorHostLaunchSecret() },
            handshakeTimeoutMs: 50,
        }, records);

        assert.strictEqual(await runConnectorHostLauncher(options), 1);
        assert.deepStrictEqual(records, []);
    });

    test('times out waiting for setup and cancels it without starting Core Tools', async () => {
        let signal: ConnectorHostLaunchSignal | undefined;
        const cancelled = new Promise<void>(resolve => {
            broker.register(cwd, async (_observation, launchSignal) => {
                signal = launchSignal;
                launchSignal.onCancelled(resolve);
                return await new Promise<boolean>(() => { /* Never completes. */ });
            });
        });
        const records: SpawnRecord[] = [];

        assert.strictEqual(await runConnectorHostLauncher(launchOptions({ decisionTimeoutMs: 100 }, records)), 1);
        await cancelled;
        assert.strictEqual(signal?.cancelled, true);
        assert.deepStrictEqual(records, []);
    });

    test('cancels setup when the task is interrupted before Core Tools starts', async () => {
        const controller = new AbortController();
        let started!: () => void;
        const setupStarted = new Promise<void>(resolve => { started = resolve; });
        let cancelled = false;
        let finish!: (value: boolean) => void;
        broker.register(cwd, async (_observation, signal) => {
            signal.onCancelled(() => { cancelled = true; });
            started();
            return await new Promise<boolean>(resolve => { finish = resolve; });
        });
        const records: SpawnRecord[] = [];
        const launch = runConnectorHostLauncher(launchOptions({ signal: controller.signal }, records));

        await setupStarted;
        controller.abort();
        assert.strictEqual(await launch, 1);
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.strictEqual(cancelled, true);
        // A late approval cannot start the host for the cancelled launch.
        finish(true);
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.deepStrictEqual(records, []);
    });

    for (const [name, handler] of [
        ['declines', async () => false],
        ['fails', async () => { throw new Error(syntheticSecret); }],
    ] as [string, ConnectorHostLaunchHandler][]) {
        test(`does not start Core Tools when setup ${name}`, async () => {
            broker.register(cwd, handler);
            const records: SpawnRecord[] = [];
            const options = launchOptions({}, records);

            assert.strictEqual(await runConnectorHostLauncher(options), 1);
            assert.deepStrictEqual(records, []);
            assert.ok(!options.errors.join('\n').includes(syntheticSecret));
        });
    }

    test('passes batch files literal arguments and refuses values cmd.exe would expand', () => {
        assert.strictEqual(
            createWindowsBatchCommandLine('C:\\Program Files\\func\\func.cmd', ['host', 'start', 'C:\\dir with space\\']),
            '"C:\\Program Files\\func\\func.cmd" "host" "start" "C:\\dir with space\\\\"',
        );
        for (const unsafe of ['%PATH%', 'a"b', 'line\nbreak']) {
            assert.strictEqual(createWindowsBatchCommandLine('func.cmd', [unsafe]), undefined, unsafe);
        }
    });

    test('resolves Core Tools on the observed PATH like the task shell', () => {
        const executables = new Set(['C:\\venv\\Scripts\\func.CMD', 'C:\\tools\\func.EXE', '/opt/venv/bin/func', '/usr/bin/func']);
        const isExecutable = (filePath: string): boolean => executables.has(filePath);
        assert.strictEqual(
            resolveExecutable('func', { Path: 'C:\\venv\\Scripts;"C:\\tools"', PATHEXT: '.EXE;.CMD' }, 'C:\\project', 'win32', isExecutable),
            'C:\\venv\\Scripts\\func.CMD',
        );
        assert.strictEqual(resolveExecutable('func', { PATH: 'C:\\tools' }, 'C:\\project', 'win32', isExecutable), 'C:\\tools\\func.EXE');
        assert.strictEqual(resolveExecutable('func', { PATH: 'C:\\missing' }, 'C:\\project', 'win32', isExecutable), undefined);
        assert.strictEqual(resolveExecutable('func', { PATH: '/opt/venv/bin:/usr/bin' }, '/project', 'linux', isExecutable), '/opt/venv/bin/func');
        assert.strictEqual(resolveExecutable('./func', { PATH: '' }, '/usr/bin', 'linux', isExecutable), '/usr/bin/func');
    });

    suite('bundled launcher process', () => {
        const launcherPath = path.join(__dirname, '..', 'dist', 'connectorHostLauncher.js');
        let binDirectory: string;
        let outputPath: string;

        setup(async function (this: Mocha.Context) {
            if (!fs.existsSync(launcherPath)) {
                this.skip();
            }
            binDirectory = path.join(cwd, 'synthetic bin');
            outputPath = path.join(cwd, 'func-output.json');
            await fs.promises.mkdir(binDirectory);
            const recorder = path.join(binDirectory, 'record.js');
            await fs.promises.writeFile(recorder, `require('fs').writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({
                cwd: process.cwd(),
                args: process.argv.slice(2),
                profile: process.env.SYNTHETIC_PROFILE_VALUE,
                launchVariables: Object.keys(process.env).filter(name => /^AZURE_FUNCTIONS_CONNECTOR_LAUNCH_/i.test(name)),
            }));`);
            if (process.platform === 'win32') {
                await fs.promises.writeFile(path.join(binDirectory, 'func.cmd'),
                    `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${recorder}" %*\r\n`);
            } else {
                const script = path.join(binDirectory, 'func');
                await fs.promises.writeFile(script, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${recorder}" "$@"\n`);
                await fs.promises.chmod(script, 0o755);
            }
        });

        async function runLauncher(): Promise<number | null> {
            const { spawn } = await import('child_process');
            const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATH'));
            const child = spawn(process.execPath, [launcherPath, 'func', 'host', 'start', '--port', '7072'], {
                cwd,
                env: {
                    ...inherited,
                    ...broker.getLaunchEnvironment(),
                    [electronRunAsNodeVariable]: '1',
                    PATH: `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
                    SYNTHETIC_PROFILE_VALUE: 'from-shell-profile',
                },
                stdio: 'ignore',
            });
            return await new Promise(resolve => child.once('exit', resolve));
        }

        test('starts the resolved Core Tools with the observed environment and working directory', async () => {
            let observed: ConnectorHostLaunchObservation | undefined;
            broker.register(cwd, async observation => {
                observed = observation;
                return true;
            });

            assert.strictEqual(await runLauncher(), 0);

            const output = JSON.parse(await fs.promises.readFile(outputPath, 'utf8')) as { cwd: string; args: string[]; profile: string; launchVariables: string[] };
            assert.ok(observed);
            assert.strictEqual(observed.environment.SYNTHETIC_PROFILE_VALUE, 'from-shell-profile');
            assert.strictEqual(await fs.promises.realpath(output.cwd), await fs.promises.realpath(observed.cwd));
            assert.deepStrictEqual(output.args, ['host', 'start', '--port', '7072']);
            assert.strictEqual(output.profile, 'from-shell-profile');
            assert.deepStrictEqual(output.launchVariables, []);
        });

        test('exits without starting Core Tools when setup does not approve the launch', async () => {
            broker.register(cwd, async () => false);

            assert.strictEqual(await runLauncher(), 1);
            assert.strictEqual(fs.existsSync(outputPath), false);
        });
    });
});

suite('Connector host launch setup', () => {
    const binding: ConnectorTriggerLocalBinding = {
        connectionSettingName: 'SyntheticConnection',
        triggerConfigSettingName: 'SyntheticTriggerConfigName',
    };
    const endpointKey = `${binding.connectionSettingName}__pollingEndpoint`;
    const configKey = binding.triggerConfigSettingName;
    const validEndpoint = 'https://synthetic.example.logic.azure.com/api/connectorGateways/synthetic-gateway';
    let projectPath: string;

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-launch-setup-'));
        await fs.promises.writeFile(path.join(projectPath, 'local.settings.json'), JSON.stringify({ IsEncrypted: false, Values: {} }));
    });

    teardown(async () => {
        await fs.promises.rm(projectPath, { recursive: true, force: true });
    });

    async function createHarness(): Promise<{ context: IActionContext; dependencies: ConnectorTriggerF5Dependencies; azureCalls: string[] }> {
        const context = await createTestActionContext();
        context.ui.showWarningMessage = async <T extends vscode.MessageItem>(_message: string, ...args: unknown[]): Promise<T> => {
            const selected = (args.slice(1) as T[]).find(item => item.title === 'Configure');
            if (!selected) {
                throw new Error('Unexpected prompt');
            }
            return selected;
        };
        const azureCalls: string[] = [];
        const record = (name: string) => async (): Promise<never> => {
            azureCalls.push(name);
            throw new Error(`Unexpected ${name}`);
        };
        const dependencies = {
            bindingResolver: { find: async () => [binding], resolve: async () => binding },
            projectStore: { read: async () => undefined, markComplete: record('markComplete') },
            gateway: new Proxy({}, { get: (_target, name) => record(`gateway.${String(name)}`) }),
            operationResolver: new Proxy({}, { get: (_target, name) => record(`operationResolver.${String(name)}`) }),
            openSetup: async () => {
                azureCalls.push('openSetup');
                throw new Error('Synthetic setup stops before Azure changes.');
            },
            localSettingsWriter: { write: record('localSettingsWriter.write') },
            workspaceIdentity: { get: async () => 'synthetic-workspace-id' },
        } as unknown as ConnectorTriggerF5Dependencies;
        return { context, dependencies, azureCalls };
    }

    async function deferSetup(harness: Awaited<ReturnType<typeof createHarness>>): Promise<ConnectorHostLaunchHandler> {
        let registered: ConnectorHostLaunchHandler | undefined;
        await validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'shell', environment: {} },
            hostLaunchSetup: { register: (registeredPath, handler) => { assert.strictEqual(registeredPath, projectPath); registered = handler; } },
        });
        assert.ok(registered);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupResult, 'deferredToHostLaunch');
        assert.deepStrictEqual(harness.azureCalls, []);
        return registered;
    }

    const signal: ConnectorHostLaunchSignal = { cancelled: false, onCancelled: () => () => { /* Never cancelled. */ } };

    test('defers setup for a launcher task instead of provisioning from the task descriptor', async () => {
        const harness = await createHarness();
        await deferSetup(harness);
        assert.strictEqual(harness.context.telemetry.properties.connectorF5SetupBlocked, undefined);
    });

    test('starts without Azure calls when the observed environment already configures the trigger', async () => {
        const harness = await createHarness();
        const handler = await deferSetup(harness);

        // Overrides found only in the observed environment were invisible when the task was selected.
        assert.strictEqual(await handler({ cwd: projectPath, environment: { [endpointKey]: validEndpoint, [configKey]: 'synthetic-config' } }, signal), true);
        assert.deepStrictEqual(harness.azureCalls, []);
    });

    test('grants nothing and writes nothing when the observed environment overrides a setting setup must write', async () => {
        const harness = await createHarness();
        const handler = await deferSetup(harness);
        const before = await fs.promises.readFile(path.join(projectPath, 'local.settings.json'), 'utf8');

        assert.strictEqual(await handler({ cwd: projectPath, environment: { [endpointKey]: 'not-a-url', AZURE_CLIENT_SECRET: syntheticSecret } }, signal), false);

        assert.deepStrictEqual(harness.azureCalls, []);
        assert.strictEqual(await fs.promises.readFile(path.join(projectPath, 'local.settings.json'), 'utf8'), before);
    });

    test('does nothing after the launcher disconnects', async () => {
        const harness = await createHarness();
        const handler = await deferSetup(harness);

        assert.strictEqual(await handler({ cwd: projectPath, environment: {} }, { cancelled: true, onCancelled: listener => { listener(); return () => undefined; } }), false);
        assert.deepStrictEqual(harness.azureCalls, []);
    });

    test('refuses an observed default credential chain before setup opens', async () => {
        const harness = await createHarness();
        harness.dependencies.openSetup = async () => {
            harness.azureCalls.push('openSetup');
            throw new Error('Setup must not open.');
        };
        const handler = await deferSetup(harness);

        assert.strictEqual(await handler({ cwd: projectPath, environment: { SYNTHETIC_PROFILE_VALUE: 'observed' } }, signal), false);
        assert.deepStrictEqual(harness.azureCalls, []);
    });

    test('runs setup only for the exact observed environment', async () => {
        const harness = await createHarness();
        let evaluated: unknown;
        harness.dependencies.openSetup = async setupContext => {
            evaluated = (setupContext as IActionContext & { hostLaunch?: unknown }).hostLaunch;
            harness.azureCalls.push('openSetup');
            throw new Error('Synthetic setup stops before Azure changes.');
        };
        const handler = await deferSetup(harness);
        const environment = { AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential', SYNTHETIC_PROFILE_VALUE: 'observed' };

        assert.strictEqual(await handler({ cwd: projectPath, environment }, signal), false);
        assert.deepStrictEqual(evaluated, { kind: 'exactEnvironment', environment });
        assert.deepStrictEqual(harness.azureCalls, ['openSetup']);
    });

    test('keeps unwrapped task launches fail-closed', async () => {
        const harness = await createHarness();
        await assert.rejects(validateConnectorNamespacePreDebug(harness.context, projectPath, harness.dependencies, {
            hostLaunch: { kind: 'task', execution: 'shell', environment: {} },
        }), /can't verify the identity/);
        assert.deepStrictEqual(harness.azureCalls, []);
    });
});
