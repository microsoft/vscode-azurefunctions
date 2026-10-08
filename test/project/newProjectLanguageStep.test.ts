/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { ProjectLanguage } from '../../src/constants';
import { type TemplateGalleryLaunchOptions } from '../../src/commands/createNewProject/FunctionsTemplateGalleryController';
import { NewProjectLanguageStep } from '../../src/commands/createNewProject/NewProjectLanguageStep';
import { type IProjectWizardContext } from '../../src/commands/createNewProject/IProjectWizardContext';

suite('NewProjectLanguageStep', () => {
    const browseTemplateGalleryLabel = 'Browse Template Gallery (Preview)...';

    async function getPromptPicks(containerizedProject: boolean): Promise<IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[]> {
        let picksResult: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[] = [];
        const context = {
            containerizedProject,
            telemetry: { properties: {} },
            ui: {
                showQuickPick: async (picks: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[], _options?: unknown) => {
                    void _options;
                    picksResult = picks;
                    const javascriptPick = picks.find(p => p.label === ProjectLanguage.JavaScript);
                    if (!javascriptPick) {
                        throw new Error('Expected JavaScript project type in quick picks.');
                    }
                    return javascriptPick;
                }
            }
        } as unknown as IProjectWizardContext;

        const step = new NewProjectLanguageStep(undefined, undefined);
        await step.prompt(context);
        return picksResult;
    }

    test('shows template gallery quick pick for non-containerized projects', async () => {
        const picks = await getPromptPicks(false);
        assert.ok(picks.some(p => p.data.language === ('TemplateGallery' as ProjectLanguage)), browseTemplateGalleryLabel);
    });

    test('does not show template gallery quick pick for containerized projects', async () => {
        const picks = await getPromptPicks(true);
        assert.ok(!picks.some(p => p.data.language === ('TemplateGallery' as ProjectLanguage)), browseTemplateGalleryLabel);
    });

    test('opens template gallery with Go selected', async () => {
        let launchOptions: TemplateGalleryLaunchOptions | undefined;
        const context = {
            projectPath: 'test-project',
            telemetry: { properties: {} },
            ui: {
                showQuickPick: async (picks: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[]) => {
                    const goPick = picks.find(p => p.data.language === ProjectLanguage.Go);
                    if (!goPick) {
                        throw new Error('Expected Go project type in quick picks.');
                    }
                    return goPick;
                }
            }
        } as unknown as IProjectWizardContext;

        const step = new NewProjectLanguageStep(undefined, undefined, options => {
            launchOptions = options;
        });

        await assert.rejects(step.prompt(context), UserCancelledError);
        assert.deepStrictEqual(launchOptions, {
            initialLocation: context.projectPath,
            initialFilters: { language: 'go' },
        });
        assert.strictEqual(context.telemetry.properties.flow, 'templateGalleryFromGo');
    });

    test('keeps containerized Go projects in the classic flow', async () => {
        let galleryOpened = false;
        const context = {
            containerizedProject: true,
            telemetry: { properties: {} },
            ui: {
                showQuickPick: async (picks: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[]) => {
                    const goPick = picks.find(p => p.data.language === ProjectLanguage.Go);
                    if (!goPick) {
                        throw new Error('Expected Go project type in quick picks.');
                    }
                    return goPick;
                }
            }
        } as unknown as IProjectWizardContext;

        const step = new NewProjectLanguageStep(undefined, undefined, () => {
            galleryOpened = true;
        });

        await step.prompt(context);
        assert.strictEqual(galleryOpened, false);
        assert.strictEqual(context.language, ProjectLanguage.Go);
    });

    test('keeps specific-template Go projects in the classic flow', async () => {
        let galleryOpened = false;
        const context = {
            telemetry: { properties: {} },
            ui: {
                showQuickPick: async (picks: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[]) => {
                    const goPick = picks.find(p => p.data.language === ProjectLanguage.Go);
                    if (!goPick) {
                        throw new Error('Expected Go project type in quick picks.');
                    }
                    return goPick;
                }
            }
        } as unknown as IProjectWizardContext;

        const step = new NewProjectLanguageStep('specific-template', undefined, () => {
            galleryOpened = true;
        });

        await step.prompt(context);
        assert.strictEqual(galleryOpened, false);
        assert.strictEqual(context.language, ProjectLanguage.Go);
    });
});
