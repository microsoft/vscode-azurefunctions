/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IActionContext, IAzExtOutputChannel } from '@microsoft/vscode-azext-utils';
import type { AzureHostExtensionApi } from '@microsoft/vscode-azext-utils/hostapi';
import type { Disposable } from 'vscode';
import type * as vscode from 'vscode';
import type { ProjectLanguage, TemplateFilter } from './constants';
import type { FuncVersion } from './FuncVersion';
import type { FunctionTemplateBase } from './templates/IFunctionTemplate';
import type { ICreateFunctionOptions } from './vscode-azurefunctions.api';

/**
 * Test-only API for accessing internal extension state.
 * This API is only available when VSCODE_RUNNING_TESTS environment variable is set.
 * It should NEVER be used in production code.
 */
export interface TestApi {
    /**
     * API version for the test API
     */
    apiVersion: '99.0.0';

    /**
     * Access to select internal extension variables (exposed as functions to avoid accidental mutation).
     */
    extensionVariables: {
        getOutputChannel(): IAzExtOutputChannel | undefined;
        getContext(): vscode.ExtensionContext | undefined;
        getRgApi(): AzureHostExtensionApi | undefined;
        getIgnoreBundle(): boolean | undefined;
    };

    /**
     * Testing utilities for overriding internal state.
     */
    testing: {
        setIgnoreBundle(ignoreBundle: boolean | undefined): void;
        /**
         * Register an onActionStartHandler in the BUNDLE's @microsoft/vscode-azext-utils instance.
         * This is needed because the test module and bundle each have their own copy of vscode-azext-utils.
         * Handlers registered in the test module do NOT apply to action contexts created within the bundle.
         */
        registerOnActionStartHandler(handler: (context: IActionContext) => void): Disposable;
    };

    /**
     * Commands exposed for testing.
     */
    commands: {
        createFunctionApp(context: IActionContext, ...args: unknown[]): Promise<string>;
        createFunctionAppAdvanced(context: IActionContext, ...args: unknown[]): Promise<string | undefined>;
        deleteFunctionApp(context: IActionContext, ...args: unknown[]): Promise<void>;
        deployProductionSlot(context: IActionContext, ...args: unknown[]): Promise<void>;
        copyFunctionUrl(context: IActionContext, ...args: unknown[]): Promise<void>;
        createNewProjectInternal(context: IActionContext, options?: ICreateFunctionOptions): Promise<void>;
        createFunctionInternal(context: IActionContext, ...args: unknown[]): Promise<void>;
        initProjectForVSCode(context: IActionContext, fsPath?: string, language?: string): Promise<void>;

        /**
         * Register a template source for the given action context.
         * This creates/caches a per-source CentralTemplateProvider in the bundle and registers it
         * as the action variable on the bundle's ext.templateProvider for the given context.
         */
        registerTemplateSource(context: IActionContext, source: string): void;

        /**
         * Get function templates from the bundled extension's CentralTemplateProvider.
         * This crosses the esbuild module boundary, using the real provider registered during activation.
         * @param source - Optional template source (Backup, Latest, Staging). If undefined, uses the default provider.
         */
        getFunctionTemplates(
            context: IActionContext,
            projectPath: string | undefined,
            language: ProjectLanguage,
            languageModel: number | undefined,
            version: FuncVersion,
            templateFilter: TemplateFilter,
            projectTemplateKey: string | undefined,
            source?: string
        ): Promise<FunctionTemplateBase[]>;
    };
}
