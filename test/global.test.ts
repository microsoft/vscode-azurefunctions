/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHookCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestOutputChannel } from 'vscode-azureextensiondev';
import { ext, TemplateSource } from '../src/extensionVariables';
import { getTemplateProvider, TemplateProvider } from '../src/templates/TemplateProvider';

export let longRunningTestsEnabled: boolean;

let templatesMap: Map<TemplateSource, TemplateProvider>;

// Runs before all tests
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(120 * 1000);
    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin
    await ext.templateProviderTask; // make sure default templates are loaded before setting up templates from other sources
    ext.outputChannel = new TestOutputChannel();

    // Use prerelease func cli installed from gulp task (unless otherwise specified in env)
    ext.funcCliPath = process.env.FUNC_PATH || path.join(os.homedir(), 'tools', 'func', 'func');

    templatesMap = new Map();
    try {
        for (const key of Object.keys(TemplateSource)) {
            const source: TemplateSource = <TemplateSource>TemplateSource[key];
            ext.templateSource = source;
            templatesMap.set(source, await getTemplateProvider());
        }
    } finally {
        ext.templateSource = undefined;
    }

    // tslint:disable-next-line:strict-boolean-expressions
    longRunningTestsEnabled = !/^(false|0)?$/i.test(process.env.ENABLE_LONG_RUNNING_TESTS || '');
});

export async function runForAllTemplateSources(callback: (source: TemplateSource, templates: TemplateProvider) => Promise<void>): Promise<void> {
    const oldProvider: Promise<TemplateProvider> = ext.templateProviderTask;
    try {
        for (const [source, templates] of templatesMap) {
            console.log(`Switching to template source "${source}".`);
            ext.templateSource = source;
            ext.templateProviderTask = Promise.resolve(templates);
            await callback(source, templates);
        }
    } finally {
        console.log(`Switching back to default template source.`);
        ext.templateSource = undefined;
        ext.templateProviderTask = oldProvider;
    }
}
