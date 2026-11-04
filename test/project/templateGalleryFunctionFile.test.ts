/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { openCreatedFunction, runPostFunctionCreateStepsFromCache } from '../../src/commands/createFunction/FunctionCreateStepBase';
import { FunctionsTemplateGalleryController } from '../../src/commands/createNewProject/FunctionsTemplateGalleryController';
import { findTemplateFunctionFile } from '../../src/commands/createNewProject/findTemplateFunctionFile';
import { ProjectLanguage } from '../../src/constants';
import { ext } from '../../src/extensionVariables';
import { getTestWorkspaceFolder } from '../global.test';

suite('Template Gallery function file', () => {
    let projectPath: string;

    setup(async () => {
        projectPath = vscode.Uri.file(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc gallery file '))).fsPath;
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
    });

    async function writeFile(relativePath: string, content: string): Promise<string> {
        const filePath = path.join(projectPath, relativePath);
        await AzExtFsExtra.ensureDir(path.dirname(filePath));
        await fs.promises.writeFile(filePath, content);
        return filePath;
    }

    for (const [language, fileName, content] of [
        [ProjectLanguage.CSharp, 'HttpTrigger.cs', '[Function("HttpTrigger")]'],
        ['CSharp', 'HttpTrigger.cs', '[FunctionName("HttpTrigger")]'],
        [ProjectLanguage.Java, path.join('src', 'main', 'java', 'sample', 'Function.java'), '@FunctionName("HttpTrigger")'],
        [ProjectLanguage.JavaScript, path.join('src', 'functions', 'http.js'), 'app.http("http", { handler });'],
        [ProjectLanguage.TypeScript, path.join('src', 'functions', 'http.ts'), 'app.http("http", { handler });'],
        [ProjectLanguage.TypeScript, path.join('src', 'functions', 'orchestrator.ts'), 'df.app.orchestration("hello", handler);'],
        [ProjectLanguage.Python, 'function_app.py', '@app.route(route="http")'],
        [ProjectLanguage.Python, 'blueprint.py', '@bp.blob_trigger(arg_name="blob")'],
        [ProjectLanguage.PowerShell, path.join('HttpTrigger', 'run.ps1'), 'param($Request, $TriggerMetadata)'],
        [ProjectLanguage.Go, 'main.go', 'func main() { }'],
    ]) {
        test(`finds ${language} entry point ${fileName}`, async () => {
            const appFolder = path.join('services', 'api');
            await writeFile(path.join(appFolder, 'host.json'), '{}');
            const filePath = await writeFile(path.join(appFolder, fileName), content);

            assert.strictEqual(await findTemplateFunctionFile(projectPath, language), filePath);
        });
    }

    test('skips startup, infrastructure, tests, dependencies, and build artifacts', async () => {
        await writeFile('host.json', '{}');
        await writeFile('Program.cs', 'var host = new HostBuilder().Build();');
        for (const folder of ['bin', 'obj', 'tests', 'node_modules']) {
            await writeFile(path.join(folder, 'host.json'), '{}');
            await writeFile(path.join(folder, 'AFunction.cs'), '[Function("NotSource")]');
        }
        await writeFile(path.join('infra', 'Deployment.cs'), 'class Deployment { }');
        const filePath = await writeFile(path.join('Functions', 'HttpTrigger.cs'), '[Function("HttpTrigger")]');

        assert.strictEqual(await findTemplateFunctionFile(projectPath, ProjectLanguage.CSharp), filePath);
    });

    test('does not open arbitrary source when there is no function entry point', async () => {
        await writeFile('host.json', '{}');
        await writeFile('Program.cs', 'var host = new HostBuilder().Build();');
        assert.strictEqual(await findTemplateFunctionFile(projectPath, ProjectLanguage.CSharp), undefined);
        assert.strictEqual(await findTemplateFunctionFile(projectPath, 'Unknown'), undefined);
    });

    test('does not select source outside a Function App', async () => {
        await writeFile('HttpTrigger.cs', '[Function("HttpTrigger")]');
        assert.strictEqual(await findTemplateFunctionFile(projectPath, ProjectLanguage.CSharp), undefined);
    });

    test('selects a deterministic first function in a multi-function template', async () => {
        await writeFile('host.json', '{}');
        await writeFile('ZTrigger.cs', '[Function("ZTrigger")]');
        const firstFile = await writeFile('ATrigger.cs', '[Function("ATrigger")]');
        assert.strictEqual(await findTemplateFunctionFile(projectPath, ProjectLanguage.CSharp), firstFile);
    });

    test('opens the generated function rather than leaving the README focused in an already-open project', async () => {
        const workspacePath = getTestWorkspaceFolder();
        const functionPath = path.join(workspacePath, 'GalleryHttpTrigger.cs');
        const readmePath = path.join(workspacePath, 'GalleryREADME.md');
        try {
            await fs.promises.writeFile(functionPath, '// generated function');
            await fs.promises.writeFile(readmePath, '# Template README');
            await vscode.window.showTextDocument(vscode.Uri.file(readmePath));
            const controller: FunctionsTemplateGalleryController = Object.create(FunctionsTemplateGalleryController.prototype);

            await controller['promptAndOpenProject'](await createTestActionContext(), workspacePath, functionPath);

            assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, functionPath);
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await fs.promises.unlink(functionPath);
            await fs.promises.unlink(readmePath);
        }
    });

    test('reopens the cached function on activation and clears its cache', async () => {
        const workspacePath = getTestWorkspaceFolder();
        const functionPath = path.join(workspacePath, 'GalleryCachedTrigger.cs');
        const originalContext = ext.context;
        const values = new Map<string, unknown>();
        const globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } = {
            keys: () => [...values.keys()],
            get: <T>(key: string, defaultValue?: T): T | undefined => values.has(key) ? values.get(key) as T : defaultValue,
            update: async (key, value) => { values.set(key, value); },
            setKeysForSync: () => undefined,
        };
        ext.context = { ...originalContext, globalState };
        try {
            await fs.promises.writeFile(functionPath, '// generated function');
            await openCreatedFunction({ projectPath: workspacePath, newFilePath: functionPath, isHttpTrigger: false, isMcpTrigger: false }, true);
            assert.ok(values.get('azFuncPostFunctionCreate'));
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');

            await runPostFunctionCreateStepsFromCache();

            assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, functionPath);
            assert.strictEqual(values.get('azFuncPostFunctionCreate'), undefined);
        } finally {
            ext.context = originalContext;
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await fs.promises.unlink(functionPath);
        }
    });
});
