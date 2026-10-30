/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, createTestActionContext, type TestUserInput } from '@microsoft/vscode-azext-utils';
import { type IProjectTemplate } from '@microsoft/vscode-azext-webview';
import * as assert from 'assert';
import { createApplyFilters } from '../../node_modules/@microsoft/vscode-azext-webview/dist/esm/src/webview/TemplateGallery/applyFilters';
import { FunctionListStep } from '../../src/commands/createFunction/FunctionListStep';
import { type IFunctionWizardContext } from '../../src/commands/createFunction/IFunctionWizardContext';
import { type ConnectorTriggerPickerLaunchOptions } from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerPickerController';
import { connectorGallery, ProjectLanguage, TemplateFilter } from '../../src/constants';
import { ext } from '../../src/extensionVariables';
import { FuncVersion } from '../../src/FuncVersion';
import { CentralTemplateProvider } from '../../src/templates/CentralTemplateProvider';
import { type FunctionTemplateBase } from '../../src/templates/IFunctionTemplate';
import { TemplateSchemaVersion } from '../../src/templates/TemplateProviderBase';

suite('Connector Gallery', () => {
    const template: FunctionTemplateBase = {
        id: 'HttpTrigger', name: 'HTTP trigger', language: ProjectLanguage.Python,
        isHttpTrigger: true, isTimerTrigger: false, isMcpTrigger: false,
        templateSchemaVersion: TemplateSchemaVersion.v1,
    };
    let provider: CentralTemplateProvider;

    suiteSetup(() => {
        provider = new CentralTemplateProvider();
        provider.getFunctionTemplates = async (_context, _projectPath, language) => [
            { ...template, id: 'QueueTrigger', name: 'Queue trigger', isHttpTrigger: false },
            { ...template, id: 'TimerTrigger', name: 'Timer trigger', isHttpTrigger: false, isTimerTrigger: true },
            { ...template, id: 'BlobTrigger', name: 'Blob trigger', isHttpTrigger: false },
            template,
        ].map(t => ({ ...t, language }));
    });

    suite('Connector Gallery missing manifest metadata', () => {
        const applyFilters = createApplyFilters({ Python: 'python' }, { Python: 'Python' });
        const baseTemplate: IProjectTemplate = {
            id: 'connector-test', displayName: 'Connector test', shortDescription: 'Test template',
            repositoryUrl: 'https://github.com/Azure/azure-functions-templates',
            languages: ['Python'],
        };
        const connectorFilters = {
            language: 'python', useCase: connectorGallery.useCase, resource: connectorGallery.resource, search: '',
        };

        for (const [name, metadata] of [
            ['missing resource', { categories: ['connectors'] }],
            ['missing use case', { resource: 'connector' }],
            ['neither connector key present', { categories: ['web-apis'], resource: 'http' }],
        ] satisfies [string, Partial<Pick<IProjectTemplate, 'categories' | 'resource'>>][]) {
            test(`${name} returns no results without throwing and supports clearing filters`, () => {
                const templates: IProjectTemplate[] = [{ ...baseTemplate, ...metadata }];
                assert.deepStrictEqual(applyFilters(templates, connectorFilters), []);
                assert.deepStrictEqual(applyFilters(templates, {
                    ...connectorFilters, useCase: 'all', resource: 'all',
                }), templates);
            });
        }
    });
    suiteTeardown(() => provider.dispose());

    async function createContext(
        overrides: Partial<Pick<IFunctionWizardContext, 'language' | 'languageModel' | 'containerizedProject'>> = {},
    ): Promise<IFunctionWizardContext & { ui: TestUserInput }> {
        const context = Object.assign(await createTestActionContext(), {
            projectPath: 'test-project', workspacePath: 'test-project',
            workspaceFolder: undefined, projectTemplateKey: undefined, language: ProjectLanguage.Python,
            languageModel: 2, version: FuncVersion.v4, activityChildren: [],
            registerActivity: async () => assert.fail('Gallery handoff must not start project execution.'),
        }, overrides);
        ext.templateProvider.registerActionVariable(provider, context);
        return context;
    }

    for (const [language, languageModel, filterLanguage] of [
        [ProjectLanguage.Python, 2, 'python'],
        [ProjectLanguage.TypeScript, 4, 'typescript'],
        [ProjectLanguage.CSharp, undefined, 'dotnet'],
    ] as const) {
        test(`opens connector picker with ${language} and preserves the project folder`, async () => {
            const context = await createContext({ language, languageModel });
            let launchOptions: ConnectorTriggerPickerLaunchOptions | undefined;
            const step = new FunctionListStep({
                isProjectWizard: true, templateId: undefined, functionSettings: undefined,
            }, options => { launchOptions = options; });
            const connectors = (await step['getPicks'](context)).filter(p => p.data === connectorGallery.id);
            assert.strictEqual(connectors.length, 1);
            assert.strictEqual(connectors[0].label, 'Connector Trigger');
            assert.strictEqual(connectors[0].description, 'Browse catalog');
            assert.strictEqual(connectors[0].group, TemplateFilter.Verified);
            await context.ui.runWithInputs(['Connector Trigger'], async () => {
                await assert.rejects(step.prompt(context), UserCancelledError);
            });
            assert.deepStrictEqual(launchOptions, {
                isProjectWizard: true,
                language,
                languageModel,
                initialLocation: context.projectPath,
                initialFilters: { language: filterLanguage, useCase: 'connectors', resource: 'connector' },
            });
            assert.strictEqual(context.language, language);
            assert.strictEqual(context.languageModel, languageModel);
            assert.strictEqual(context.functionTemplate, undefined);
            assert.strictEqual(context.telemetry.properties.flow, 'templateGalleryFromConnector');
            assert.strictEqual(context.telemetry.properties.templateId, 'connectorGallery');
        });
    }

    test('offers connector picker when adding a function to an existing project', async () => {
        const context = await createContext();
        let launchOptions: ConnectorTriggerPickerLaunchOptions | undefined;
        const step = new FunctionListStep({
            isProjectWizard: false, templateId: undefined, functionSettings: undefined,
        }, options => { launchOptions = options; });
        const connectors = (await step['getPicks'](context)).filter(p => p.data === connectorGallery.id);

        assert.strictEqual(connectors.length, 1);
        assert.strictEqual(connectors[0].label, 'Connector Trigger');
        assert.strictEqual(connectors[0].description, 'Browse catalog');
        assert.strictEqual(connectors[0].group, TemplateFilter.Verified);
        await context.ui.runWithInputs(['Connector Trigger'], async () => {
            await assert.rejects(step.prompt(context), UserCancelledError);
        });
        assert.deepStrictEqual(launchOptions, {
            isProjectWizard: false,
            language: ProjectLanguage.Python,
            languageModel: 2,
            initialLocation: context.projectPath,
            initialFilters: { language: 'python', useCase: 'connectors', resource: 'connector' },
        });
    });

    for (const [name, overrides, isProjectWizard, templateId] of [
        ['containerized project', { containerizedProject: true }, true, undefined],
        ['specific template', {}, true, 'HttpTrigger'],
        ['Python v1', { languageModel: 1 }, true, undefined],
        ['JavaScript v4', { language: ProjectLanguage.JavaScript, languageModel: 4 }, true, undefined],
        ['TypeScript v3', { language: ProjectLanguage.TypeScript, languageModel: 3 }, true, undefined],
        ['PowerShell', { language: ProjectLanguage.PowerShell, languageModel: undefined }, true, undefined],
    ] as const) {
        test(`does not offer connector gallery for ${name}`, async () => {
            const context = await createContext(overrides);
            const step = new FunctionListStep({ isProjectWizard, templateId, functionSettings: undefined });
            assert.ok(!(await step['getPicks'](context)).some(p => p.data === connectorGallery.id));
        });
    }

    for (const [language, languageModel, shouldOfferConnector] of [
        [ProjectLanguage.CSharp, undefined, true],
        [ProjectLanguage.TypeScript, 4, true],
        [ProjectLanguage.JavaScript, 4, false],
        [ProjectLanguage.PowerShell, undefined, false],
    ] as const) {
        test(`empty classic templates show the warning for ${language}`, async () => {
            const originalGetTemplates = provider.getFunctionTemplates;
            provider.getFunctionTemplates = async () => [];
            try {
                const context = await createContext({ language, languageModel });
                const step = new FunctionListStep({ isProjectWizard: true, templateId: undefined, functionSettings: undefined });
                const picks = await step['getPicks'](context);
                assert.deepStrictEqual(picks.map(p => p.label), [
                    ...(shouldOfferConnector ? ['Connector Trigger'] : []),
                    '$(warning) No templates found',
                    '$(clock) Skip for now',
                ]);
            } finally {
                provider.getFunctionTemplates = originalGetTemplates;
            }
        });
    }

    test('keeps regular trigger selection and skipping in the classic flow', async () => {
        const step = new FunctionListStep({
            isProjectWizard: true, templateId: undefined, functionSettings: undefined,
        }, () => assert.fail('Classic selections must not open the gallery.'));
        for (const input of ['HTTP trigger', /skip for now/i]) {
            const context = await createContext();
            await context.ui.runWithInputs([input], async () => step.prompt(context));
            assert.deepStrictEqual(context.functionTemplate, typeof input === 'string' ? { ...template, language: context.language } : undefined);
        }
    });
});
