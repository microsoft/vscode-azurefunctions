/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createNewProject } from '../src/commands/createNewProject';
import { ProjectLanguage } from '../src/ProjectSettings';
import * as fsUtil from '../src/utils/fs';
import { TestUI } from './TestUI';

const testFolderPath: string = path.join(os.tmpdir(), `azFunc.createNewProjectTests${fsUtil.getRandomHexString()}`);
const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions Test');

suite('Create New Java Project Tests', () => {

    suiteSetup(async () => {
        await fse.ensureDir(testFolderPath);
    });

    suiteTeardown(async () => {
        outputChannel.dispose();
        await fse.remove(testFolderPath);
    });

    const javaProject: string = 'JavaProject';
    test(javaProject, async () => {
        await testCreateNewProject(
            ProjectLanguage.Java,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        );
        await testJavaProjectFilesExist(testFolderPath);
    }).timeout(60 * 1000);
});

suite('Create New JavaScript Project Tests', () => {

    suiteSetup(async () => {
        await fse.ensureDir(testFolderPath);
    });

    suiteTeardown(async () => {
        outputChannel.dispose();
        await fse.remove(testFolderPath);
    });

    const javaScriptProject: string = 'JavaScriptProject';
    test(javaScriptProject, async () => {
        await testCreateNewProject(ProjectLanguage.JavaScript);
        await testProjectFilesExist(testFolderPath);
    }).timeout(10 * 1000);
});

suite('Create New C# Project Tests', () => {

    suiteSetup(async () => {
        await fse.ensureDir(testFolderPath);
    });

    suiteTeardown(async () => {
        outputChannel.dispose();
        await fse.remove(testFolderPath);
    });

    const javaScriptProject: string = 'CSharpProject';
    test(javaScriptProject, async () => {
        await testCreateNewProject(ProjectLanguage.CSharp);
        await testProjectFilesExist(testFolderPath);
    }).timeout(10 * 1000);
});

async function testCreateNewProject(language: string, ...inputs: (string | undefined)[]): Promise<void> {
    // Setup common inputs
    inputs.unshift(language); // Specify the function name
    inputs.unshift(testFolderPath); // Select the test func app folder
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        inputs.unshift(undefined); // If the test environment has an open workspace, select the 'Browse...' option
    }

    const ui: TestUI = new TestUI(inputs);
    await createNewProject({}, outputChannel, undefined, false, ui);
    assert.equal(inputs.length, 0, 'Not all inputs were used.');
}

async function testProjectFilesExist(projectPath: string): Promise<void> {
    assert.equal(await fse.pathExists(path.join(projectPath, '.gitignore')), true, '.gitignore does not exist');
    assert.equal(await fse.pathExists(path.join(projectPath, 'host.json')), true, 'host.json does not exist');
    assert.equal(await fse.pathExists(path.join(projectPath, 'local.settings.json')), true, 'function.json does not exist');
    assert.equal(await fse.pathExists(path.join(projectPath, '.git')), true, '.git folder does not exist');
    const vscodePath: string = path.join(projectPath, '.vscode');
    assert.equal(await fse.pathExists(path.join(vscodePath, 'settings.json')), true, 'settings.json does not exist');
    assert.equal(await fse.pathExists(path.join(vscodePath, 'launch.json')), true, 'launch.json does not exist');
    assert.equal(await fse.pathExists(path.join(vscodePath, 'tasks.json')), true, 'tasks.json does not exist');
}

async function testJavaProjectFilesExist(projectPath: string): Promise<void> {
    await testProjectFilesExist(projectPath);
    assert.equal(await fse.pathExists(path.join(projectPath, 'src')), true, 'src folder does not exist');
    assert.equal(await fse.pathExists(path.join(projectPath, 'pom.xml')), true, 'pom.xml does not exist');
}
