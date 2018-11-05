/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHookCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext, TemplateSource } from '../src/extensionVariables';
import { FunctionTemplates, getFunctionTemplates } from '../src/templates/FunctionTemplates';

export let longRunningTestsEnabled: boolean;

let templatesMap: Map<TemplateSource, FunctionTemplates>;

// Runs before all tests
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(120 * 1000);
    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin

    // Use prerelease func cli installed from gulp task (unless otherwise specified in env)
    ext.funcCliPath = process.env.FUNC_PATH || path.join(os.homedir(), 'tools', 'func', 'func');

    templatesMap = new Map();
    try {
        for (const key of Object.keys(TemplateSource)) {
            const source: TemplateSource = <TemplateSource>TemplateSource[key];
            ext.templateSource = source;
            templatesMap.set(source, await getFunctionTemplates());
        }
    } finally {
        ext.templateSource = undefined;
    }

    // tslint:disable-next-line:strict-boolean-expressions
    longRunningTestsEnabled = !/^(false|0)?$/i.test(process.env.ENABLE_LONG_RUNNING_TESTS || '');
});

export async function runForAllTemplateSources(callback: (source: TemplateSource, templates: FunctionTemplates) => Promise<void>): Promise<void> {
    const oldTemplates: FunctionTemplates = ext.functionTemplates;
    try {
        for (const [source, templates] of templatesMap) {
            console.log(`Switching to template source "${source}".`);
            ext.templateSource = source;
            ext.functionTemplates = templates;
            await callback(source, templates);
        }
    } finally {
        console.log(`Switching back to default template source.`);
        ext.templateSource = undefined;
        ext.functionTemplates = oldTemplates;
    }
}
