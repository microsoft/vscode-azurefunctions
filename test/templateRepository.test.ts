/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext, testGlobalSetup } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectLanguage } from '../src/constants';
import { type IProjectTemplate, type ITemplateManifest } from '../src/templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../src/templates/projectTemplates/ProjectTemplateProvider';
import { cloneTemplateRepository, getTemplateArchiveRoot, getTemplateArchiveUrl, getTemplateFolder, getTemplateGitRef, getTemplateReadmeUrl } from '../src/templates/projectTemplates/templateRepository';
import { cpUtils } from '../src/utils/cpUtils';

suite('Template repository regressions', () => {
    suiteSetup(() => testGlobalSetup());

    const repositoryUrl = 'https://github.com/example/sample.git';
    const sha = '6613dfbdaecefcd5f9623aa7a8f8325f714905ac';
    for (const [templateRef, expectedRef] of [
        [{ gitRef: 'refs/tags/v1.0.0', branch: 'ignored' }, 'refs/tags/v1.0.0'],
        [{ gitRef: 'refs/heads/feature/test' }, 'refs/heads/feature/test'],
        [{ gitRef: sha }, sha],
        [{ branch: 'legacy' }, 'refs/heads/legacy'],
        [{}, 'refs/heads/main']
    ] as const) {
        test(`git, ZIP and README honor ${expectedRef}`, async () => {
            const template: Pick<IProjectTemplate, 'repositoryUrl' | 'gitRef' | 'branch' | 'folderPath'> = { repositoryUrl, ...templateRef, folderPath: 'src/McpWeatherApp' };
            assert.strictEqual(getTemplateGitRef(template), expectedRef);
            assert.strictEqual(getTemplateArchiveUrl(template), `https://github.com/example/sample/archive/${expectedRef}.zip`);
            assert.strictEqual(getTemplateReadmeUrl(template), `https://raw.githubusercontent.com/example/sample/${expectedRef}/README.md`);
            const original = cpUtils.executeCommand;
            const commands: string[][] = [];
            const destination = path.resolve(__dirname, '..', 'unused-clone-destination');
            try {
                cpUtils.executeCommand = async (_output, cwd, command, args) => {
                    assert.strictEqual(command, 'git');
                    assert.ok(Array.isArray(args));
                    assert.strictEqual(cwd, commands.length === 0 ? undefined : destination);
                    commands.push(args as string[]);
                    return '';
                };
                await cloneTemplateRepository(template, destination);
                assert.deepStrictEqual(commands, [
                    ['init', destination],
                    ['remote', 'add', 'origin', repositoryUrl],
                    ['fetch', '--depth', '1', '--filter=blob:none', 'origin', expectedRef],
                    ['sparse-checkout', 'set', 'src/McpWeatherApp'],
                    ['checkout', '--detach', 'FETCH_HEAD']
                ]);
            } finally {
                cpUtils.executeCommand = original;
            }
        });
    }

    test('root and legacy subdirectory selection are retained', () => {
        assert.strictEqual(getTemplateFolder({}), undefined);
        assert.strictEqual(getTemplateFolder({ folderPath: '.' }), undefined);
        assert.strictEqual(getTemplateFolder({ subdirectory: 'legacy' }), 'legacy');
        assert.strictEqual(getTemplateFolder({ folderPath: 'src', subdirectory: 'legacy' }), 'src');
        assert.strictEqual(getTemplateFolder({ folderPath: '.', subdirectory: 'legacy' }), 'legacy');
    });

    test('git fetches a commit and checks out the selected folder from a local repository', async function (this: Mocha.Context): Promise<void> {
        this.timeout(30000);
        const repository = path.resolve(__dirname, '..');
        const revision = (await cpUtils.executeCommand(undefined, repository, 'git', ['rev-parse', 'HEAD'])).trim();
        const directory = await fs.mkdtemp(path.join(repository, '.gallery-git-test-'));
        try {
            const destination = path.join(directory, 'checkout');
            await cloneTemplateRepository({ repositoryUrl: repository, gitRef: revision, folderPath: 'src/templates' }, destination);
            assert.strictEqual((await cpUtils.executeCommand(undefined, destination, 'git', ['rev-parse', 'HEAD'])).trim(), revision);
            assert.ok((await fs.stat(path.join(destination, 'src', 'templates', 'projectTemplates', 'IProjectTemplate.ts'))).isFile());
            await assert.rejects(fs.stat(path.join(destination, 'src', 'debug')));
        } finally {
            await fs.rm(directory, { recursive: true, force: true });
        }
    });

    test('URL paths encode reserved characters without losing ref separators', () => {
        const template = { repositoryUrl, gitRef: 'refs/tags/release#1', folderPath: 'sample folder/src' };
        assert.strictEqual(getTemplateArchiveUrl(template), 'https://github.com/example/sample/archive/refs/tags/release%231.zip');
        assert.strictEqual(getTemplateReadmeUrl(template), 'https://raw.githubusercontent.com/example/sample/refs/tags/release%231/README.md');
    });

    test('provider normalization preserves the manifest ref and selected folder', async () => {
        class TestProvider extends ProjectTemplateProvider {
            public async getManifest(): Promise<ITemplateManifest> {
                return {
                    version: '1', generatedAt: '',
                    templates: [{
                        id: 'test', displayName: 'test', shortDescription: '', categories: [],
                        languages: [ProjectLanguage.Python], repositoryUrl, gitRef: 'refs/tags/v1.0.0',
                        folderPath: 'src/McpWeatherApp'
                    }]
                };
            }
        }
        await runWithTestActionContext('testTemplateRef', async context => {
            const [template] = await new TestProvider().getTemplates(context);
            assert.strictEqual(template.gitRef, 'refs/tags/v1.0.0');
            assert.strictEqual(template.folderPath, 'src/McpWeatherApp');
        });
    });

    test('archive root uses the extracted directory rather than guessing a branch-derived name', async () => {
        const directory = await fs.mkdtemp(path.resolve(__dirname, '..', '.gallery-archive-test-'));
        try {
            for (const name of ['sample-1.0.0', 'sample-feature-test', `sample-${sha}`]) {
                const root = path.join(directory, name);
                await fs.mkdir(path.join(root, 'src', 'McpWeatherApp'), { recursive: true });
                assert.strictEqual(await getTemplateArchiveRoot(directory), root);
                assert.ok((await fs.stat(path.join(await getTemplateArchiveRoot(directory), 'src', 'McpWeatherApp'))).isDirectory());
                await fs.rm(root, { recursive: true });
            }
            await assert.rejects(getTemplateArchiveRoot(directory), /single repository directory/);
            await fs.mkdir(path.join(directory, 'one'));
            await fs.mkdir(path.join(directory, 'two'));
            await assert.rejects(getTemplateArchiveRoot(directory), /single repository directory/);
        } finally {
            await fs.rm(directory, { recursive: true, force: true });
        }
    });
});
