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
import { createFunctionFromCommand, createFunctionInternal } from '../../src/commands/createFunction/createFunction';
import { createNewProjectFromCommand, routeCreateNewProject } from '../../src/commands/createNewProject/createNewProject';
import { FunctionsTemplateGalleryController } from '../../src/commands/createNewProject/FunctionsTemplateGalleryController';
import { classicTemplateFeedSetting, ProjectLanguage } from '../../src/constants';
import { ext } from '../../src/extensionVariables';
import { FuncVersion } from '../../src/FuncVersion';
import { CentralTemplateProvider } from '../../src/templates/CentralTemplateProvider';
import { TemplateSchemaVersion } from '../../src/templates/TemplateProviderBase';
import { LocalProjectTreeItem } from '../../src/tree/localProject/LocalProjectTreeItem';
import { getWorkspaceSetting } from '../../src/vsCodeConfig/settings';
import { runWithFuncSetting } from '../runWithSetting';
import { getTestWorkspaceFolder } from '../global.test';

suite('Create New Project experience', () => {
    test('opens the template gallery by default without an experience prompt', async () => {
        const context = await createTestActionContext();
        const { calls, handlers } = createHandlers();

        await routeCreateNewProject(context, { classicTemplateFeed: false }, handlers);

        assert.strictEqual(calls.classic, 0);
        assert.strictEqual(calls.templateGallery, 1);
        assert.strictEqual(context.telemetry.properties.projectCreationExperience, 'templateGallery');
        assert.strictEqual(context.telemetry.properties.classicTemplateFeed, 'false');
        assert.strictEqual(context.telemetry.properties.flow, 'templateGallery');
    });

    test('uses the classic template feed when the user setting is enabled', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, true, async () => {
            const context = await createTestActionContext();
            const { calls, handlers } = createHandlers();

            await routeCreateNewProject(context, {}, handlers);

            assert.strictEqual(calls.classic, 1);
            assert.strictEqual(calls.templateGallery, 0);
            assert.strictEqual(context.telemetry.properties.projectCreationExperience, 'classic');
            assert.strictEqual(context.telemetry.properties.classicTemplateFeed, 'true');
        });
    });

    test('returns to the gallery when the classic setting is disabled', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const context = await createTestActionContext();
            const { calls, handlers } = createHandlers();

            await routeCreateNewProject(context, {}, handlers);

            assert.strictEqual(calls.classic, 0);
            assert.strictEqual(calls.templateGallery, 1);
        });
    });

    test('preserves explicit classic paths even when the gallery is the default', async () => {
        for (const options of [{ templateId: 'HttpTrigger' }, { startFromScratch: true }]) {
            const context = await createTestActionContext();
            const { calls, handlers } = createHandlers();

            await routeCreateNewProject(context, { ...options, classicTemplateFeed: false }, handlers);

            assert.strictEqual(calls.classic, 1);
            assert.strictEqual(calls.templateGallery, 0);
        }
    });
});

suite('Unified Create Function', () => {
    let folderPath: string;
    let originalContext: vscode.ExtensionContext;
    const originalFetchTemplates = FunctionsTemplateGalleryController.prototype['fetchTemplates'];

    setup(async () => {
        originalContext = ext.context;
        const extension = vscode.extensions.getExtension('ms-azuretools.vscode-azurefunctions');
        assert.ok(extension);
        ext.context = { ...originalContext, extensionPath: extension.extensionPath };
        folderPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc unified creation '));
        FunctionsTemplateGalleryController.prototype['fetchTemplates'] = async () => ({ templates: [], defaultLocation: folderPath });
    });

    teardown(async () => {
        FunctionsTemplateGalleryController.currentController?.panel.dispose();
        FunctionsTemplateGalleryController.prototype['fetchTemplates'] = originalFetchTemplates;
        ext.context = originalContext;
        await AzExtFsExtra.deleteResource(folderPath, { recursive: true, useTrash: false });
    });

    test('opens the gallery for an empty folder and preserves the selected target', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            await createFunctionFromCommand(await createTestActionContext(), folderPath);

            const controller = FunctionsTemplateGalleryController.currentController;
            assert.ok(controller);
            assert.strictEqual(controller['initialLocation'], folderPath);
            assert.deepStrictEqual(await fs.promises.readdir(folderPath), []);
        });
    });

    test('keeps the API new-project handoff separate from the gallery', async () => {
        let target: string | undefined;
        await createFunctionInternal(await createTestActionContext(), { folderPath }, async (_context, options) => {
            target = options.folderPath;
        });

        assert.strictEqual(target, folderPath);
        assert.strictEqual(FunctionsTemplateGalleryController.currentController, undefined);
    });

    test('preserves the selected tree folder rather than choosing another workspace', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const node: LocalProjectTreeItem = Object.assign(Object.create(LocalProjectTreeItem.prototype), {
                preCompiledProjectPath: folderPath,
                effectiveProjectPath: path.join(folderPath, 'bin'),
            });

            await createFunctionFromCommand(await createTestActionContext(), node);

            assert.strictEqual(FunctionsTemplateGalleryController.currentController?.['initialLocation'], folderPath);
        });
    });

    test('opens the project gallery even when the target already contains a Functions project', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            await fs.promises.writeFile(path.join(folderPath, 'host.json'), '{}');
            await createNewProjectFromCommand(await createTestActionContext(), folderPath);

            assert.strictEqual(FunctionsTemplateGalleryController.currentController?.['initialLocation'], folderPath);
        });
    });

    test('keeps both creation commands visible in the command palette and workspace actions', async () => {
        const manifest = await AzExtFsExtra.readJSON<{
            contributes: { menus: Record<string, { command: string; when?: string }[]> };
        }>(path.join(ext.context.extensionPath, 'package.json'));
        for (const command of ['azureFunctions.createNewProject', 'azureFunctions.createFunction']) {
            assert.ok(!manifest.contributes.menus.commandPalette.some(item => item.command === command && item.when === 'never'));
            assert.ok(manifest.contributes.menus['azureFunctions.submenus.workspaceActions'].some(item => item.command === command));
        }
    });

    test('adds functions through the classic feed after gallery initialization without another initialization prompt', async () => {
        const workspacePath = getTestWorkspaceFolder();
        const context = await createTestActionContext();
        const provider = new CentralTemplateProvider();
        const selectionReached = new Error('Reached function template selection');
        provider.getFunctionTemplates = async () => [{
            id: 'HttpTrigger', name: 'HTTP trigger', language: ProjectLanguage.TypeScript,
            isHttpTrigger: true, isTimerTrigger: false, isMcpTrigger: false,
            templateSchemaVersion: TemplateSchemaVersion.v2,
        }];
        ext.templateProvider.registerActionVariable(provider, context);
        let placeHolder: string | undefined;
        context.ui.showQuickPick = async (_picks, options) => {
            placeHolder = options.placeHolder;
            throw selectionReached;
        };
        try {
            await AzExtFsExtra.writeJSON(path.join(workspacePath, 'host.json'), { version: '2.0' });
            await AzExtFsExtra.writeJSON(path.join(workspacePath, 'package.json'), {
                dependencies: { '@azure/functions': '^4.0.0' },
            });
            const controller: FunctionsTemplateGalleryController = Object.create(FunctionsTemplateGalleryController.prototype);
            controller['sendProgress'] = () => undefined;
            await runWithFuncSetting('projectRuntime', FuncVersion.v4, async () => {
                await controller['initializeProjectForVSCode'](await createTestActionContext(), workspacePath, ProjectLanguage.TypeScript);
            });
            await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
                await assert.rejects(createFunctionFromCommand(context, workspacePath), error => error === selectionReached);
            });
            assert.ok(placeHolder?.startsWith('Select a template for your function'));
            assert.strictEqual(FunctionsTemplateGalleryController.currentController, undefined);
        } finally {
            provider.dispose();
            await AzExtFsExtra.emptyDir(workspacePath);
        }
    });

    test('unwraps an Azure Resources tree selection without losing the target folder', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const node: LocalProjectTreeItem = Object.assign(Object.create(LocalProjectTreeItem.prototype), {
                preCompiledProjectPath: folderPath,
            });

            await createFunctionFromCommand(await createTestActionContext(), { unwrap: () => node }, [{ unwrap: () => node }]);

            assert.strictEqual(FunctionsTemplateGalleryController.currentController?.['initialLocation'], folderPath);
        });
    });

    test('initializes a gallery app inside an existing workspace without changing the parent project', async () => {
        const workspacePath = getTestWorkspaceFolder();
        const galleryPath = path.join(workspacePath, 'new-project');
        try {
            await AzExtFsExtra.writeJSON(path.join(workspacePath, 'host.json'), { version: '2.0' });
            await AzExtFsExtra.ensureDir(path.join(workspacePath, '.vscode'));
            const parentSettings = { 'editor.tabSize': 3 };
            await AzExtFsExtra.writeJSON(path.join(workspacePath, '.vscode', 'settings.json'), parentSettings);
            await AzExtFsExtra.ensureDir(galleryPath);
            await AzExtFsExtra.writeJSON(path.join(galleryPath, 'host.json'), { version: '2.0' });
            await AzExtFsExtra.writeJSON(path.join(galleryPath, 'package.json'), {
                dependencies: { '@azure/functions': '^4.0.0' },
            });
            const controller: FunctionsTemplateGalleryController = Object.create(FunctionsTemplateGalleryController.prototype);
            controller['sendProgress'] = () => undefined;

            await runWithFuncSetting('projectRuntime', FuncVersion.v4, async () => {
                await controller['initializeProjectForVSCode'](await createTestActionContext(), galleryPath, ProjectLanguage.TypeScript);
            });

            const settings = await AzExtFsExtra.readJSON<Record<string, unknown>>(path.join(galleryPath, '.vscode', 'settings.json'));
            assert.strictEqual(settings['azureFunctions.projectLanguage'], ProjectLanguage.TypeScript);
            assert.strictEqual(settings['azureFunctions.projectLanguageModel'], 4);
            assert.deepStrictEqual(await AzExtFsExtra.readJSON(path.join(workspacePath, '.vscode', 'settings.json')), parentSettings);
            assert.ok(!await AzExtFsExtra.pathExists(path.join(workspacePath, '.vscode', 'tasks.json')));
        } finally {
            await AzExtFsExtra.emptyDir(workspacePath);
        }
    });

    test('keeps existing projects in the function template feed', async () => {
        await fs.promises.writeFile(path.join(folderPath, 'host.json'), '{}');
        const context = await createTestActionContext();
        const provider = new CentralTemplateProvider();
        provider.getFunctionTemplates = async () => [{
            id: 'HttpTrigger', name: 'HTTP trigger', language: ProjectLanguage.Python,
            isHttpTrigger: true, isTimerTrigger: false, isMcpTrigger: false,
            templateSchemaVersion: TemplateSchemaVersion.v1,
        }];
        ext.templateProvider.registerActionVariable(provider, context);
        const selectionReached = new Error('Reached function template selection');
        let placeHolder: string | undefined;
        context.ui.showQuickPick = async (_picks, options) => {
            placeHolder = options.placeHolder;
            throw selectionReached;
        };
        try {
            await assert.rejects(
                createFunctionFromCommand(context, folderPath, undefined, undefined, undefined, ProjectLanguage.Python, FuncVersion.v4),
                error => error === selectionReached,
            );
            assert.ok(placeHolder?.startsWith('Select a template for your function'));
            assert.strictEqual(FunctionsTemplateGalleryController.currentController, undefined);
        } finally {
            provider.dispose();
        }
    });

    test('shows a top banner with only the classic-switch command enabled', () => {
        const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
        const html = controller.panel.webview.html;

        const bannerPosition = html.indexOf('Prefer the classic experience?');
        assert.ok(bannerPosition >= 0 && bannerPosition < html.indexOf('<div id="root">'));
        assert.ok(html.includes('href="command:azureFunctions.useClassicTemplateFeed"'));
        assert.ok(html.includes('Switch to classic'));
        assert.ok(html.includes('Your preference will be saved for future projects.'));
        assert.ok(html.includes('role="note"'));
        assert.ok(html.includes('aria-hidden="true" focusable="false"'));
        assert.ok(html.includes('--vscode-inputValidation-infoBackground'));
        assert.deepStrictEqual(controller.panel.webview.options.enableCommandUris, ['azureFunctions.useClassicTemplateFeed']);
    });

    test('switching saves the preference, closes the gallery, and keeps the target folder', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
            let target: string | undefined;

            await controller.useClassicTemplateFeed(await createTestActionContext(), async (_context, options) => {
                assert.strictEqual(getWorkspaceSetting(classicTemplateFeedSetting), true);
                assert.strictEqual(FunctionsTemplateGalleryController.currentController, undefined);
                target = options.folderPath;
            });

            assert.strictEqual(target, folderPath);
            assert.strictEqual(getWorkspaceSetting(classicTemplateFeedSetting), true);
        });
    });

    test('does not switch experiences or save a preference during project creation', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
            controller['isCreatingProject'] = true;

            await assert.rejects(
                controller.useClassicTemplateFeed(await createTestActionContext(), async () => assert.fail('Must not start classic creation')),
                /Wait for project creation to finish/,
            );

            assert.strictEqual(getWorkspaceSetting(classicTemplateFeedSetting), false);
            assert.strictEqual(FunctionsTemplateGalleryController.currentController, controller);
            await assert.rejects(
                controller['createProject']({
                    id: 'test', displayName: 'Test', shortDescription: 'Test',
                    repositoryUrl: 'https://github.com/Azure/azure-functions-templates', languages: ['Python'],
                }, 'Python', folderPath),
                /Wait for the current project creation operation/,
            );
            assert.deepStrictEqual(await fs.promises.readdir(folderPath), []);
        });
    });
});

function createHandlers(): {
    calls: { classic: number; templateGallery: number };
    handlers: {
        createClassicProject(): Promise<void>;
        showTemplateGallery(): void;
    };
} {
    const calls = { classic: 0, templateGallery: 0 };
    return {
        calls,
        handlers: {
            createClassicProject: async () => {
                calls.classic += 1;
            },
            showTemplateGallery: () => {
                calls.templateGallery += 1;
            },
        },
    };
}
