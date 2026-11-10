/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, callWithTelemetryAndErrorHandling, createTestActionContext, initializeWorkflowTelemetry, registerTelemetryHandler, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { TemplateGalleryController } from '@microsoft/vscode-azext-webview';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createFunctionFromCommand, createFunctionInternal } from '../../src/commands/createFunction/createFunction';
import { createNewProjectFromCommand, routeCreateNewProject } from '../../src/commands/createNewProject/createNewProject';
import { FunctionsTemplateGalleryController } from '../../src/commands/createNewProject/FunctionsTemplateGalleryController';
import { classicTemplateFeedSetting, ProjectLanguage, showClassicTemplateFeedBannerSetting } from '../../src/constants';
import { ext } from '../../src/extensionVariables';
import { FuncVersion } from '../../src/FuncVersion';
import { CentralTemplateProvider } from '../../src/templates/CentralTemplateProvider';
import { TemplateSchemaVersion } from '../../src/templates/TemplateProviderBase';
import { LocalProjectTreeItem } from '../../src/tree/localProject/LocalProjectTreeItem';
import { telemetryUtils } from '../../src/utils/telemetryUtils';
import { getWorkspaceSetting } from '../../src/vsCodeConfig/settings';
import { runWithFuncSetting } from '../runWithSetting';
import { runWithTelemetryContext } from '../utils/runWithTelemetryContext';
import { getTestWorkspaceFolder } from '../global.test';

suite('Create New Project experience', () => {
    test('telemetry privacy retains supported language categories and rejects arbitrary values', () => {
        for (const language of Object.values(ProjectLanguage)) {
            assert.strictEqual(telemetryUtils.getProjectLanguage(language), language);
        }
        assert.strictEqual(telemetryUtils.getProjectLanguage('synthetic-personal-value'), 'unknown');
        assert.strictEqual(telemetryUtils.getProjectLanguage(undefined), 'unknown');
    });

    test('opens the template gallery by default without an experience prompt', async () => {
        const context = await createTestActionContext();
        initializeWorkflowTelemetry(context, { workflow: 'createProject', command: 'createNewProject' });
        const { calls, handlers } = createHandlers();

        await runWithTelemetryContext(context, async () => routeCreateNewProject(context, { classicTemplateFeed: false }, handlers));

        assert.strictEqual(calls.classic, 0);
        assert.strictEqual(calls.templateGallery, 1);
        assert.strictEqual(context.telemetry.properties.projectCreationExperience, 'templateGallery');
        assert.strictEqual(context.telemetry.properties.classicTemplateFeed, 'false');
        assert.strictEqual(context.telemetry.properties.flow, 'templateGallery');
        assert.strictEqual(context.telemetry.properties.projectCreationRouteReason, 'default');
        assert.strictEqual(context.telemetry.properties.outcome, 'handedOff');
        assert.strictEqual(context.telemetry.properties.cancelReason, 'templateGallery');
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
            assert.strictEqual(context.telemetry.properties.projectCreationRouteReason, 'savedPreference');
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
            assert.strictEqual(context.telemetry.properties.projectCreationRouteReason, 'explicitArguments');
        }
    });

    test('telemetry privacy redacts classic-route error details without changing the local error', async () => {
        const callbackId = 'azureFunctions.createNewProject';
        const syntheticContent = 'synthetic-personal-value';
        const error = new Error(`Could not find template "${syntheticContent}".`);
        let properties: IActionContext['telemetry']['properties'] | undefined;
        const hook = registerTelemetryHandler(context => {
            if (context.callbackId === callbackId) {
                properties = context.telemetry.properties;
            }
        });
        try {
            await assert.rejects(callWithTelemetryAndErrorHandling(callbackId, async context => {
                context.errorHandling.suppressDisplay = true;
                context.errorHandling.rethrow = true;
                await routeCreateNewProject(context, { templateId: syntheticContent }, {
                    createClassicProject: async () => { throw error; },
                    showTemplateGallery: () => assert.fail('Must retain explicit classic routing'),
                });
            }), caught => caught === error);
            assert.ok(properties);
            assert.strictEqual(properties.result, 'Failed');
            assert.ok(!Object.values(properties).some(value => typeof value === 'string' && value.includes(syntheticContent)));
            assert.ok(error.message.includes(syntheticContent));
        } finally {
            hook.dispose();
        }
    });
});

suite('Unified Create Function', () => {
    let folderPath: string;
    let telemetryHook: vscode.Disposable;
    let events: { name: string; properties: IActionContext['telemetry']['properties']; measurements: IActionContext['telemetry']['measurements'] }[];
    const originalFetchTemplates = FunctionsTemplateGalleryController.prototype['fetchTemplates'];

    setup(async () => {
        folderPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc unified creation '));
        FunctionsTemplateGalleryController.prototype['fetchTemplates'] = async () => ({ templates: [], defaultLocation: folderPath });
        events = [];
        telemetryHook = registerTelemetryHandler(context => {
            events.push({ name: context.callbackId, properties: { ...context.telemetry.properties }, measurements: { ...context.telemetry.measurements } });
        });
    });

    teardown(async () => {
        FunctionsTemplateGalleryController.currentController?.panel.dispose();
        telemetryHook.dispose();
        FunctionsTemplateGalleryController.prototype['fetchTemplates'] = originalFetchTemplates;
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

    test('keeps an inferred workspace as a gallery default without changing API destination options', async () => {
        const workspacePath = getTestWorkspaceFolder();
        const workspaceFolder = vscode.workspace.workspaceFolders?.find(folder => folder.uri.fsPath === workspacePath);
        assert.ok(workspaceFolder);
        const originalPicker = vscode.window.showWorkspaceFolderPick;
        vscode.window.showWorkspaceFolderPick = async () => workspaceFolder;
        try {
            const options = {};
            let called = false;
            await createFunctionInternal(await createTestActionContext(), options, async (_context, actualOptions, defaultLocation) => {
                assert.strictEqual(actualOptions, options);
                assert.strictEqual(actualOptions.folderPath, undefined);
                assert.strictEqual(defaultLocation, workspacePath);
                called = true;
            });
            assert.ok(called);
        } finally {
            vscode.window.showWorkspaceFolderPick = originalPicker;
        }
    });

    test('preserves an explicit nested project instead of discovering the containing root project', async () => {
        const workspacePath = getTestWorkspaceFolder();
        const selectedProjectPath = path.join(workspacePath, 'child');
        const context = await createTestActionContext();
        const provider = new CentralTemplateProvider();
        const selectionReached = new Error('Reached selected project templates');
        let requestedProjectPath: string | undefined;
        provider.getFunctionTemplates = async (_context, projectPath) => {
            requestedProjectPath = projectPath;
            return [{
                id: 'HttpTrigger', name: 'HTTP trigger', language: ProjectLanguage.TypeScript,
                isHttpTrigger: true, isTimerTrigger: false, isMcpTrigger: false,
                templateSchemaVersion: TemplateSchemaVersion.v2,
            }];
        };
        ext.templateProvider.registerActionVariable(provider, context);
        context.ui.showQuickPick = async () => { throw selectionReached; };
        try {
            await AzExtFsExtra.ensureDir(selectedProjectPath);
            await AzExtFsExtra.writeJSON(path.join(workspacePath, 'host.json'), { version: '2.0' });
            await AzExtFsExtra.writeJSON(path.join(selectedProjectPath, 'host.json'), { version: '2.0' });

            await assert.rejects(createFunctionInternal(context, {
                folderPath: selectedProjectPath,
                language: ProjectLanguage.TypeScript,
                languageModel: 4,
                version: FuncVersion.v4,
            }), error => error === selectionReached);
            assert.strictEqual(requestedProjectPath, selectedProjectPath);
        } finally {
            provider.dispose();
            await AzExtFsExtra.emptyDir(workspacePath);
        }
    });

    test('does not pass a stale launch folder to classic creation after a changed gallery destination', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const originalBrowse = TemplateGalleryController.prototype['browseFolder'];
            const selectedLocation = path.join(folderPath, 'selected');
            TemplateGalleryController.prototype['browseFolder'] = async () => selectedLocation;
            try {
                const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
                assert.strictEqual(await controller['browseFolder'](), selectedLocation);
                let called = false;
                await controller.useClassicTemplateFeed(await createTestActionContext(), async (_context, options) => {
                    assert.strictEqual(options.folderPath, undefined);
                    called = true;
                });
                assert.ok(called);
            } finally {
                TemplateGalleryController.prototype['browseFolder'] = originalBrowse;
            }
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
        let requestedLanguageModel: number | undefined;
        provider.getFunctionTemplates = async (_context, _projectPath, _language, languageModel) => {
            requestedLanguageModel = languageModel;
            return [{
                id: 'HttpTrigger', name: 'HTTP trigger', language: ProjectLanguage.TypeScript,
                isHttpTrigger: true, isTimerTrigger: false, isMcpTrigger: false,
                templateSchemaVersion: TemplateSchemaVersion.v2,
            }];
        };
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
                await runWithFuncSetting('projectLanguageModel', 3, async () => {
                    await controller['initializeProjectForVSCode'](await createTestActionContext(), workspacePath, ProjectLanguage.TypeScript);
                });
            });
            await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
                await assert.rejects(createFunctionFromCommand(context, workspacePath), error => error === selectionReached);
            });
            assert.ok(placeHolder?.startsWith('Select a template for your function'));
            assert.strictEqual(requestedLanguageModel, 4);
            assert.strictEqual(FunctionsTemplateGalleryController.currentController, undefined);
            assert.strictEqual(context.telemetry.properties.functionCreationExperience, 'classic');
            assert.strictEqual(context.telemetry.properties.functionCreationRouteReason, 'existingProject');
            assert.strictEqual(context.telemetry.properties.functionLanguage, ProjectLanguage.TypeScript);
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

    test('telemetry privacy allowlists language from project settings before template selection', async () => {
        await fs.promises.writeFile(path.join(folderPath, 'host.json'), '{}');
        const context = await createTestActionContext();
        const provider = new CentralTemplateProvider();
        const selectionReached = new Error('Stop before template retrieval');
        provider['getCachedProviders'] = async () => { throw selectionReached; };
        ext.templateProvider.registerActionVariable(provider, context);
        try {
            await runWithFuncSetting('projectLanguage', 'synthetic-personal-value', async () => {
                await assert.rejects(
                    createFunctionInternal(context, { folderPath, version: FuncVersion.v4 }),
                    error => error === selectionReached,
                );
            });
            assert.strictEqual(context.telemetry.properties.functionLanguage, 'unknown');
            assert.strictEqual(context.telemetry.properties.projectLanguage, 'unknown');
            assert.ok(!Object.values(context.telemetry.properties).some(value => value === 'synthetic-personal-value'));
        } finally {
            provider.dispose();
        }
    });

    test('shows an accessible top banner with only its switch and dismiss commands enabled', () => {
        const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
        const html = controller.panel.webview.html;

        const bannerPosition = html.indexOf('Prefer the classic experience?');
        assert.ok(bannerPosition >= 0 && bannerPosition < html.indexOf('<div id="root">'));
        assert.ok(html.includes('href="command:azureFunctions.useClassicTemplateFeed"'));
        assert.ok(html.includes('Switch to classic'));
        assert.ok(!html.includes('Your preference will be saved for future projects.'));
        assert.ok(html.includes('role="note"'));
        assert.ok(html.includes('padding: 6px 24px;'));
        assert.ok(html.includes('aria-hidden="true" focusable="false"'));
        assert.ok(html.includes('--vscode-inputValidation-infoBackground'));
        assert.ok(html.includes('border-left: 4px solid var(--vscode-editorInfo-foreground)'));
        assert.ok(html.includes('<strong style="font-size: 14px;">Prefer the classic experience?</strong>'));
        assert.ok(html.includes('--vscode-button-secondaryBackground'));
        assert.ok(html.includes('href="command:azureFunctions.dismissClassicTemplateFeedBanner"'));
        assert.ok(html.includes('role="button" aria-label="Dismiss classic experience banner"'));
        assert.ok(html.includes("if (event.key === ' ')"));
        assert.deepStrictEqual(controller.panel.webview.options.enableCommandUris, ['azureFunctions.useClassicTemplateFeed', 'azureFunctions.dismissClassicTemplateFeedBanner']);
    });

    test('dismissing the banner persists independently without reloading gallery state or canceling creation', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            await runWithFuncSetting(showClassicTemplateFeedBannerSetting, true, async () => {
                const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
                const originalHtml = controller.panel.webview.html;
                const messages: unknown[] = [];
                controller.panel.webview.postMessage = async message => {
                    messages.push(message);
                    return true;
                };
                controller['isCreatingProject'] = true;
                const context = await createTestActionContext();

                await controller.dismissClassicTemplateFeedBanner(context);

                assert.strictEqual(getWorkspaceSetting(showClassicTemplateFeedBannerSetting), false);
                assert.strictEqual(getWorkspaceSetting(classicTemplateFeedSetting), false);
                assert.strictEqual(context.telemetry.properties.classicBannerDismissed, 'true');
                assert.deepStrictEqual(messages, [{ type: 'dismissClassicTemplateFeedBanner' }]);
                assert.strictEqual(controller.panel.webview.html, originalHtml);
                assert.strictEqual(FunctionsTemplateGalleryController.currentController, controller);
                assert.strictEqual(controller['isCreatingProject'], true);
                controller['isCreatingProject'] = false;
                controller.panel.dispose();

                const reopened = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
                assert.ok(!reopened.panel.webview.html.includes('classic-template-feed-banner'));
                assert.ok(!reopened.panel.webview.html.includes('Prefer the classic experience?'));
                assert.ok(reopened.panel.webview.html.includes('<div id="root">'));
                reopened.panel.dispose();
            });
        });
    });

    test('the banner can be restored in Settings without changing the creation experience', async () => {
        await runWithFuncSetting(showClassicTemplateFeedBannerSetting, false, async () => {
            const hidden = FunctionsTemplateGalleryController.createOrShow(ext.context);
            assert.ok(!hidden.panel.webview.html.includes('classic-template-feed-banner'));
            hidden.panel.dispose();
            await runWithFuncSetting(showClassicTemplateFeedBannerSetting, true, async () => {
                const visible = FunctionsTemplateGalleryController.createOrShow(ext.context);
                assert.ok(visible.panel.webview.html.includes('classic-template-feed-banner'));
                visible.panel.dispose();
            });
        });
    });

    test('contributes an application-scoped banner setting and hides the dismiss command from the palette', async () => {
        const manifest = await AzExtFsExtra.readJSON<{
            contributes: {
                commands: { command: string; title: string }[];
                menus: Record<string, { command: string; when?: string }[]>;
                configuration: { properties: Record<string, { type?: string; scope?: string; default?: boolean }> }[];
            };
        }>(path.join(ext.context.extensionPath, 'package.json'));
        const command = 'azureFunctions.dismissClassicTemplateFeedBanner';
        assert.ok(manifest.contributes.commands.some(entry => entry.command === command));
        assert.ok(manifest.contributes.menus.commandPalette.some(entry => entry.command === command && entry.when === 'never'));
        const setting = manifest.contributes.configuration.map(entry => entry.properties[`azureFunctions.${showClassicTemplateFeedBannerSetting}`]).find(entry => entry !== undefined);
        assert.strictEqual(setting?.type, 'boolean');
        assert.strictEqual(setting?.scope, 'application');
        assert.strictEqual(setting?.default, true);
    });

    test('switching saves the preference, closes the gallery, and keeps the target folder', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
            let target: string | undefined;
            const context = await createTestActionContext();

            await controller.useClassicTemplateFeed(context, async (_context, options) => {
                assert.strictEqual(getWorkspaceSetting(classicTemplateFeedSetting), true);
                assert.strictEqual(FunctionsTemplateGalleryController.currentController, undefined);
                target = options.folderPath;
            });

            assert.strictEqual(target, undefined);
            assert.strictEqual(getWorkspaceSetting(classicTemplateFeedSetting), true);
            assert.strictEqual(context.telemetry.properties.projectCreationRouteReason, 'galleryBanner');
            assert.strictEqual(context.telemetry.properties.classicPreferenceSaved, 'true');
            assert.strictEqual(context.telemetry.properties.classicSwitchStage, 'complete');
            await Promise.resolve();
            assert.ok(events.some(event => event.name.endsWith('.closed') && event.properties.reason === 'classic'));
        });
    });

    test('distinguishes gallery open, reuse, abandonment, and closing during creation', async () => {
        const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
        assert.strictEqual(FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath }), controller);
        controller.panel.dispose();
        await Promise.resolve();
        assert.deepStrictEqual(events.filter(event => event.name.endsWith('.opened')).map(event => event.properties.reused), ['false', 'true']);
        const abandoned = events.find(event => event.name.endsWith('.closed'));
        assert.strictEqual(abandoned?.properties.reason, 'abandoned');
        assert.ok(abandoned && typeof abandoned.measurements.galleryDuration === 'number' && abandoned.measurements.galleryDuration >= 0);

        const creating = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
        creating['isCreatingProject'] = true;
        creating.panel.dispose();
        await Promise.resolve();
        assert.ok(events.some(event => event.name.endsWith('.closed') && event.properties.reason === 'closedDuringCreation'));
    });

    test('keeps the saved classic preference distinct from canceling the classic wizard', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
            await callWithTelemetryAndErrorHandling('azureFunctions.useClassicTemplateFeed', async context => {
                await controller.useClassicTemplateFeed(context, async () => { throw new UserCancelledError(); });
            });

            const switched = events.find(event => event.name === 'azureFunctions.useClassicTemplateFeed');
            assert.strictEqual(switched?.properties.classicPreferenceSaved, 'true');
            assert.strictEqual(switched?.properties.classicSwitchStage, 'classicWizard');
            assert.strictEqual(switched?.properties.result, 'Canceled');
            assert.strictEqual(getWorkspaceSetting(classicTemplateFeedSetting), true);
            assert.strictEqual(FunctionsTemplateGalleryController.currentController, undefined);
        });
    });

    test('telemetry privacy redacts errors after switching from the gallery to classic', async () => {
        await runWithFuncSetting(classicTemplateFeedSetting, false, async () => {
            const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
            let properties: IActionContext['telemetry']['properties'] | undefined;
            const hook = registerTelemetryHandler(context => {
                if (context.callbackId === 'azureFunctions.useClassicTemplateFeed') {
                    properties = context.telemetry.properties;
                }
            });
            try {
                await callWithTelemetryAndErrorHandling('azureFunctions.useClassicTemplateFeed', async context => {
                    context.errorHandling.suppressDisplay = true;
                    await controller.useClassicTemplateFeed(context, async () => { throw new Error('synthetic-personal-value'); });
                });
                assert.ok(properties);
                assert.strictEqual(properties.result, 'Failed');
                assert.strictEqual(properties.classicPreferenceSaved, 'true');
                assert.ok(!Object.values(properties).some(value => typeof value === 'string' && value.includes('synthetic-personal-value')));
            } finally {
                hook.dispose();
            }
        });
    });

    test('records catalog counts and only reports template IDs from the loaded catalog', async () => {
        const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
        controller['templateProvider'].getTemplates = async context => {
            context.telemetry.properties.manifestSource = 'cache';
            return [{
                id: 'official-template', displayName: 'Official', shortDescription: '', categories: [],
                repositoryUrl: 'https://github.com/Azure/azure-functions-templates', languages: [ProjectLanguage.Python],
            }];
        };
        await originalFetchTemplates.call(controller);
        await originalFetchTemplates.call(controller);
        controller['onTemplateSelected']('official-template');
        controller['onTemplateSelected']('private-user-input');
        await Promise.resolve();
        const loads = events.filter(event => event.name.endsWith('.getTemplates'));
        assert.deepStrictEqual(loads.map(event => event.properties.catalogRequest), ['initial', 'reload']);
        assert.ok(loads.every(event => event.measurements.templateCount === 1 && event.properties.manifestSource === 'cache'));
        assert.deepStrictEqual(events.filter(event => event.name.endsWith('.templateSelected')).map(event => event.properties.templateId), ['official-template', 'unknown']);
        assert.ok(!JSON.stringify(events).includes('private-user-input'));
        assert.ok(!JSON.stringify(events).includes(folderPath));
    });

    test('records folder picker cancellation separately from project creation', async () => {
        const browse = TemplateGalleryController.prototype['browseFolder'];
        TemplateGalleryController.prototype['browseFolder'] = async () => undefined;
        try {
            const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
            assert.strictEqual(await controller['browseFolder'](), undefined);
            assert.ok(events.some(event => event.name.endsWith('.browseFolder') && event.properties.outcome === 'canceled'));
            assert.ok(!events.some(event => event.name.endsWith('.projectCreated')));
        } finally {
            TemplateGalleryController.prototype['browseFolder'] = browse;
        }
    });

    test('records a bounded fallback reason rather than the manifest fetch error text', async () => {
        const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
        const provider = controller['templateProvider'];
        provider['getCachedManifest'] = async () => undefined;
        provider['fetchManifestFromRemote'] = async () => { throw new Error('private-user-input'); };
        provider['getBundledManifest'] = async () => ({ version: '1', generatedAt: '', templates: [] });
        const context = await createTestActionContext();

        await provider.getManifest(context);

        assert.strictEqual(context.telemetry.properties.manifestSource, 'bundled');
        assert.strictEqual(context.telemetry.properties.manifestFetchFailed, 'true');
        assert.strictEqual(context.telemetry.properties.manifestFetchError, undefined);
        assert.ok(!JSON.stringify(context.telemetry).includes('private-user-input'));
    });

    test('dismissing the post-create opener is not a canceled project creation', async () => {
        const controller = FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: folderPath });
        const context = await createTestActionContext();
        context.ui.showQuickPick = async () => { throw new UserCancelledError(); };
        await runWithFuncSetting('projectOpenBehavior', undefined, async () => {
            await controller['promptAndOpenProject'](context, folderPath);
        });
        assert.strictEqual(context.telemetry.properties.openBehavior, 'canceled');
        assert.ok(events.some(event => event.name.endsWith('.openBehavior') && event.properties.openBehavior === 'canceled'));
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
