/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext, type IAzExtOutputChannel, TestOutputChannel } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type ExtensionContext, type Memento, Uri } from 'vscode';
import { func } from '../src/constants';
import { type IExtensionVariables } from '../src/extensionVariables';
import { type CentralTemplateProvider } from '../src/templates/CentralTemplateProvider';

/**
 * Mock implementation of ActionVariable for testing
 */
class MockActionVariable<T> {
    private _extensionVariable: T | undefined;
    private _key: string;

    public constructor(key: string) {
        this._key = key;
    }

    public registerActionVariable(value: T, context: IActionContext): void {
        context[this._key] = value;
    }

    public registerExtensionVariable(value: T): void {
        this._extensionVariable = value;
    }

    public get(context: IActionContext): T {
        if (context[this._key] !== undefined) {
            return <T>context[this._key];
        } else if (this._extensionVariable !== undefined) {
            return <T>this._extensionVariable;
        } else {
            throw new Error(`Internal Error: "${this._key}" must be registered before use.`);
        }
    }
}

/**
 * Creates a mock Memento for VS Code extension context
 */
function createMockMemento(): Memento {
    const storage = new Map<string, unknown>();
    return {
        keys: () => Array.from(storage.keys()),
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            return storage.has(key) ? storage.get(key) as T : defaultValue;
        },
        update: async (key: string, value: unknown): Promise<void> => {
            if (value === undefined) {
                storage.delete(key);
            } else {
                storage.set(key, value);
            }
        }
    };
}

/**
 * Creates a mock ExtensionContext for testing
 * @param testFolderPath The test folder path to use for storage paths
 * @param extensionPath Optional path to the extension folder (defaults to workspace root)
 */
export function createMockExtensionContext(testFolderPath: string, extensionPath?: string): ExtensionContext {
    const resolvedExtensionPath = extensionPath ?? path.resolve(__dirname, '..');

    return {
        subscriptions: [],
        workspaceState: createMockMemento(),
        globalState: Object.assign(createMockMemento(), {
            setKeysForSync: (_keys: readonly string[]) => { /* no-op */ }
        }),
        secrets: {
            get: async (_key: string) => undefined,
            store: async (_key: string, _value: string) => { /* no-op */ },
            delete: async (_key: string) => { /* no-op */ },
            onDidChange: { dispose: () => { /* no-op */ } } as any
        },
        extensionUri: Uri.file(resolvedExtensionPath),
        extensionPath: resolvedExtensionPath,
        environmentVariableCollection: {
            persistent: true,
            description: 'Mock environment variables',
            replace: () => { /* no-op */ },
            append: () => { /* no-op */ },
            prepend: () => { /* no-op */ },
            get: () => undefined,
            forEach: () => { /* no-op */ },
            delete: () => { /* no-op */ },
            clear: () => { /* no-op */ },
            getScoped: () => ({} as any),
            [Symbol.iterator]: function* () { yield* []; }
        } as any,
        asAbsolutePath: (relativePath: string) => path.join(resolvedExtensionPath, relativePath),
        storageUri: Uri.file(testFolderPath),
        storagePath: testFolderPath,
        globalStorageUri: Uri.file(testFolderPath),
        globalStoragePath: testFolderPath,
        logUri: Uri.file(path.join(testFolderPath, 'logs')),
        logPath: path.join(testFolderPath, 'logs'),
        extensionMode: 3, // ExtensionMode.Test
        extension: {
            id: 'ms-azuretools.vscode-azurefunctions',
            extensionUri: Uri.file(resolvedExtensionPath),
            extensionPath: resolvedExtensionPath,
            isActive: true,
            packageJSON: {},
            exports: undefined,
            activate: async () => { /* no-op */ },
            extensionKind: 1
        } as any,
        languageModelAccessInformation: {} as any
    };
}

/**
 * Creates mock extension variables for testing
 * @param testFolderPath The test folder path to use for storage paths
 * @param extensionPath Optional path to the extension folder (for reading backup templates)
 */
export function createMockExtensionVariables(testFolderPath: string, extensionPath?: string): IExtensionVariables {
    const mockContext = createMockExtensionContext(testFolderPath, extensionPath);

    return {
        context: mockContext,
        azureAccountTreeItem: undefined as any,
        outputChannel: new TestOutputChannel() as IAzExtOutputChannel,
        defaultFuncCliPath: func,
        ignoreBundle: undefined,
        prefix: 'azureFunctions',
        experimentationService: {
            getLiveTreatmentVariable: async <T>(_name: string): Promise<T | undefined> => undefined,
            getLiveTreatmentVariableAsync: async <T>(_name: string): Promise<T | undefined> => undefined,
            isCachedFlightEnabled: async (_flight: string): Promise<boolean> => false,
            isFlightEnabled: async (_flight: string): Promise<boolean> => false,
        } as any,
        templateProvider: new MockActionVariable<CentralTemplateProvider>('_centralTemplateProvider') as any,
        rgApi: undefined as any,
        rgApiV2: undefined as any,
        eventGridProvider: undefined as any,
        currentExecutingFunctionNode: undefined,
        fileToFunctionNodeMap: new Map(),
        isExecutingFunction: undefined
    };
}
